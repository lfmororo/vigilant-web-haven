
-- Enums
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_client', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.service_order_status AS ENUM ('draft', 'in_progress', 'completed', 'cancelled');

-- Equipment Types
CREATE TABLE public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'monitor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment types"
  ON public.equipment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage equipment types"
  ON public.equipment_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  equipment_type_id UUID REFERENCES public.equipment_types(id),
  equipment_info TEXT,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients can create tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());
CREATE POLICY "Admins can update tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tickets"
  ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ticket Messages
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      NOT is_internal
      AND EXISTS (SELECT 1 FROM public.tickets WHERE tickets.id = ticket_id AND tickets.client_id = auth.uid())
    )
  );
CREATE POLICY "Users can send messages on own tickets"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.tickets WHERE tickets.id = ticket_id AND tickets.client_id = auth.uid())
    )
  );

-- Service Orders
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  ticket_id UUID REFERENCES public.tickets(id),
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  technician_id UUID REFERENCES public.profiles(id),
  status public.service_order_status NOT NULL DEFAULT 'draft',
  diagnosis TEXT,
  solution TEXT,
  parts_used JSONB DEFAULT '[]'::jsonb,
  labor_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  client_signature TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own service orders"
  ON public.service_orders FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can create service orders"
  ON public.service_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update service orders"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete service orders"
  ON public.service_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed equipment types
INSERT INTO public.equipment_types (name, icon) VALUES
  ('Câmera/CFTV', 'camera'),
  ('Alarme', 'bell'),
  ('Controle de Acesso', 'key-round'),
  ('PC/Notebook', 'laptop'),
  ('Impressora', 'printer'),
  ('Rede/Switch', 'network'),
  ('Ar-condicionado', 'thermometer'),
  ('Outros', 'box');
