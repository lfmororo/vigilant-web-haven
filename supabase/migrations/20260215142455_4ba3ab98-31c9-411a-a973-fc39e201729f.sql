-- Add parent_client_id to profiles so users can be linked to a parent client
ALTER TABLE public.profiles ADD COLUMN parent_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_profiles_parent_client_id ON public.profiles(parent_client_id);
