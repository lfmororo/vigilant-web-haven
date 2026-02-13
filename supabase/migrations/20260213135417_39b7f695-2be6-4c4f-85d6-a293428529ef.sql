
-- =============================================
-- RLS policies para TÉCNICOS acessarem tickets
-- =============================================

-- tickets: SELECT para técnicos verem tickets atribuídos a eles
CREATE POLICY "Technicians can view assigned tickets"
ON public.tickets FOR SELECT
USING (has_role(auth.uid(), 'technician') AND assigned_to = auth.uid());

-- tickets: UPDATE para técnicos atualizarem tickets atribuídos
CREATE POLICY "Technicians can update assigned tickets"
ON public.tickets FOR UPDATE
USING (has_role(auth.uid(), 'technician') AND assigned_to = auth.uid());

-- tickets: INSERT para técnicos criarem tickets
CREATE POLICY "Technicians can create tickets"
ON public.tickets FOR INSERT
WITH CHECK (has_role(auth.uid(), 'technician'));

-- =============================================
-- ticket_messages: Técnicos podem ver e enviar mensagens
-- =============================================

-- DROP existing restrictive policies and recreate with technician support
DROP POLICY IF EXISTS "Users can view ticket messages" ON public.ticket_messages;
CREATE POLICY "Users can view ticket messages"
ON public.ticket_messages FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR (has_role(auth.uid(), 'technician') AND EXISTS (
    SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.assigned_to = auth.uid()
  ))
  OR (NOT is_internal AND EXISTS (
    SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.client_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Users can send messages on own tickets" ON public.ticket_messages;
CREATE POLICY "Users can send messages on own tickets"
ON public.ticket_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND (
    has_role(auth.uid(), 'admin')
    OR (has_role(auth.uid(), 'technician') AND EXISTS (
      SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.assigned_to = auth.uid()
    ))
    OR EXISTS (
      SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.client_id = auth.uid()
    )
  )
);

-- =============================================
-- service_orders: Técnicos podem ver e atualizar OS atribuídas
-- =============================================

-- SELECT: técnicos veem suas OS
CREATE POLICY "Technicians can view assigned service orders"
ON public.service_orders FOR SELECT
USING (has_role(auth.uid(), 'technician') AND technician_id = auth.uid());

-- UPDATE: técnicos atualizam suas OS
CREATE POLICY "Technicians can update assigned service orders"
ON public.service_orders FOR UPDATE
USING (has_role(auth.uid(), 'technician') AND technician_id = auth.uid());

-- INSERT: técnicos criam OS
CREATE POLICY "Technicians can create service orders"
ON public.service_orders FOR INSERT
WITH CHECK (has_role(auth.uid(), 'technician'));

-- =============================================
-- profiles: Técnicos podem ver perfis (para ver nomes de clientes)
-- =============================================
CREATE POLICY "Technicians can view profiles"
ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'technician'));
