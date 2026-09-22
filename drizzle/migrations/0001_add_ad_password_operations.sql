ALTER TABLE public.provisioning_requests
  ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'create'
    CHECK (operation IN ('create', 'reset_password')),
  ADD COLUMN IF NOT EXISTS notify_on_completion BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS source_request_id UUID REFERENCES public.provisioning_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provisioning_requests_source_request_id
  ON public.provisioning_requests(source_request_id);
CREATE INDEX IF NOT EXISTS idx_provisioning_requests_client_operation_status
  ON public.provisioning_requests(client_id, operation, status);