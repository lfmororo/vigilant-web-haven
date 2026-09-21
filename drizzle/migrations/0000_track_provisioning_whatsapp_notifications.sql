ALTER TABLE public.provisioning_requests
  ADD COLUMN IF NOT EXISTS whatsapp_notification_status text NOT NULL DEFAULT 'pending'
    CHECK (whatsapp_notification_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_notification_error text;

CREATE INDEX IF NOT EXISTS idx_provisioning_requests_client_status_finished
  ON public.provisioning_requests (client_id, status, finished_at DESC);