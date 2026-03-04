
CREATE TABLE public.whatsapp_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number integer,
  notification_type text NOT NULL,
  recipient_phone text NOT NULL,
  message_preview text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view whatsapp logs"
  ON public.whatsapp_notification_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage whatsapp logs"
  ON public.whatsapp_notification_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_whatsapp_logs_created_at ON public.whatsapp_notification_logs(created_at DESC);
CREATE INDEX idx_whatsapp_logs_ticket_id ON public.whatsapp_notification_logs(ticket_id);
