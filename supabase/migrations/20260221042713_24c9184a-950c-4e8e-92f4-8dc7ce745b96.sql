
-- 1. Create independent clients table
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  phone text,
  email_domain text,
  whatsapp_group_id text,
  address text,
  address_number text,
  address_complement text,
  neighborhood text,
  city text,
  parent_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Admins can manage clients" ON public.clients FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view clients" ON public.clients FOR SELECT
  USING (has_role(auth.uid(), 'technician'::app_role));

CREATE POLICY "Users can view their linked client" ON public.clients FOR SELECT
  USING (
    id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
    OR parent_client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
  );

-- 4. Migrate existing client data preserving UUIDs
INSERT INTO public.clients (id, full_name, email, phone, email_domain, whatsapp_group_id, address, address_number, address_complement, neighborhood, city, created_at, updated_at)
SELECT p.id, p.full_name, p.email, p.phone, p.email_domain, p.whatsapp_group_id, p.address, p.address_number, p.address_complement, p.neighborhood, p.city, p.created_at, p.updated_at
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'client';

-- 5. Set parent_client_id for child clients
UPDATE public.clients c
SET parent_client_id = p.parent_client_id
FROM profiles p
WHERE p.id = c.id AND p.parent_client_id IS NOT NULL
  AND p.parent_client_id IN (SELECT id FROM public.clients);

-- 6. Update FK constraints to point to clients table
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_client_id_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_client_id_fkey;
ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE public.equipment_inventory DROP CONSTRAINT IF EXISTS equipment_inventory_client_id_fkey;
ALTER TABLE public.equipment_inventory ADD CONSTRAINT equipment_inventory_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE public.inventory_api_keys DROP CONSTRAINT IF EXISTS inventory_api_keys_client_id_fkey;
ALTER TABLE public.inventory_api_keys ADD CONSTRAINT inventory_api_keys_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE public.imap_accounts DROP CONSTRAINT IF EXISTS imap_accounts_client_id_fkey;
ALTER TABLE public.imap_accounts ADD CONSTRAINT imap_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

-- 7. Update profiles.parent_client_id to reference clients
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_parent_client_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_parent_client_id_fkey FOREIGN KEY (parent_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- 8. Remove 'client' role entries (clients no longer need auth roles)
DELETE FROM public.user_roles WHERE role = 'client';

-- 9. Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Update RLS on tickets - users linked to a client can view that client's tickets
DROP POLICY IF EXISTS "Clients can view own tickets" ON public.tickets;
CREATE POLICY "Users can view client tickets" ON public.tickets FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'technician'::app_role) AND (assigned_to = auth.uid() OR created_by = auth.uid()))
    OR client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
  );

-- 11. Update ticket insert policy - users create tickets for their linked client
DROP POLICY IF EXISTS "Clients can create tickets" ON public.tickets;
CREATE POLICY "Users can create tickets for their client" ON public.tickets FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technician'::app_role)
    OR client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
  );

-- 12. Update service_orders RLS
DROP POLICY IF EXISTS "Clients can view own service orders" ON public.service_orders;
CREATE POLICY "Users can view client service orders" ON public.service_orders FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'technician'::app_role) AND technician_id = auth.uid())
    OR client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
  );

-- 13. Update equipment_inventory RLS
DROP POLICY IF EXISTS "Clients can view own equipment" ON public.equipment_inventory;
CREATE POLICY "Users can view client equipment" ON public.equipment_inventory FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technician'::app_role)
    OR client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
  );

-- 14. Update ticket_messages RLS
DROP POLICY IF EXISTS "Users can view ticket messages" ON public.ticket_messages;
CREATE POLICY "Users can view ticket messages" ON public.ticket_messages FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'technician'::app_role) AND EXISTS (
      SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.assigned_to = auth.uid()
    ))
    OR (NOT is_internal AND EXISTS (
      SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id
        AND tickets.client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
    ))
  );

DROP POLICY IF EXISTS "Users can send messages on own tickets" ON public.ticket_messages;
CREATE POLICY "Users can send messages on own tickets" ON public.ticket_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'technician'::app_role) AND EXISTS (
        SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.assigned_to = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id
          AND tickets.client_id IN (SELECT parent_client_id FROM profiles WHERE id = auth.uid() AND parent_client_id IS NOT NULL)
      )
    )
  );
