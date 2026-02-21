-- Add incident support to tickets
ALTER TABLE public.tickets 
  ADD COLUMN is_incident boolean NOT NULL DEFAULT false,
  ADD COLUMN parent_incident_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN incident_message text;

-- Index for quick lookup of active incidents
CREATE INDEX idx_tickets_active_incidents ON public.tickets(is_incident, status) WHERE is_incident = true;

-- Index for finding linked tickets
CREATE INDEX idx_tickets_parent_incident ON public.tickets(parent_incident_id) WHERE parent_incident_id IS NOT NULL;