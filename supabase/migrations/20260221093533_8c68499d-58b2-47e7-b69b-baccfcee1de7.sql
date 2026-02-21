
-- Table to store customer satisfaction ratings
CREATE TABLE public.ticket_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES public.profiles(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  comment TEXT,
  rating_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  rated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one rating per ticket
ALTER TABLE public.ticket_ratings ADD CONSTRAINT ticket_ratings_ticket_id_unique UNIQUE (ticket_id);

-- Enable RLS
ALTER TABLE public.ticket_ratings ENABLE ROW LEVEL SECURITY;

-- Admins can view all ratings
CREATE POLICY "Admins can view all ratings"
ON public.ticket_ratings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage ratings
CREATE POLICY "Admins can manage ratings"
ON public.ticket_ratings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Technicians can view their own ratings
CREATE POLICY "Technicians can view own ratings"
ON public.ticket_ratings FOR SELECT
USING (has_role(auth.uid(), 'technician'::app_role) AND technician_id = auth.uid());

-- Clients can view ratings for their tickets
CREATE POLICY "Clients can view own ratings"
ON public.ticket_ratings FOR SELECT
USING (client_id IN (
  SELECT profiles.parent_client_id FROM profiles
  WHERE profiles.id = auth.uid() AND profiles.parent_client_id IS NOT NULL
));

-- Index for performance
CREATE INDEX idx_ticket_ratings_technician ON public.ticket_ratings(technician_id);
CREATE INDEX idx_ticket_ratings_client ON public.ticket_ratings(client_id);
CREATE INDEX idx_ticket_ratings_token ON public.ticket_ratings(rating_token);
