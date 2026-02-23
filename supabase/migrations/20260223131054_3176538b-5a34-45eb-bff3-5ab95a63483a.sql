
-- Create sectors table linked to clients
CREATE TABLE public.client_sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint per client
ALTER TABLE public.client_sectors ADD CONSTRAINT unique_sector_per_client UNIQUE (client_id, name);

-- Enable RLS
ALTER TABLE public.client_sectors ENABLE ROW LEVEL SECURITY;

-- Admins can manage sectors
CREATE POLICY "Admins can manage sectors" ON public.client_sectors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Users can view sectors of their client
CREATE POLICY "Users can view own client sectors" ON public.client_sectors
  FOR SELECT USING (
    client_id IN (SELECT parent_client_id FROM public.profiles WHERE id = auth.uid())
  );

-- Add sector_id to profiles
ALTER TABLE public.profiles ADD COLUMN sector_id UUID REFERENCES public.client_sectors(id) ON DELETE SET NULL;

-- Add sector_id to equipment_inventory
ALTER TABLE public.equipment_inventory ADD COLUMN sector_id UUID REFERENCES public.client_sectors(id) ON DELETE SET NULL;

-- Add sector_id to tickets
ALTER TABLE public.tickets ADD COLUMN sector_id UUID REFERENCES public.client_sectors(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_client_sectors_client_id ON public.client_sectors(client_id);
CREATE INDEX idx_profiles_sector_id ON public.profiles(sector_id);
CREATE INDEX idx_equipment_inventory_sector_id ON public.equipment_inventory(sector_id);
CREATE INDEX idx_tickets_sector_id ON public.tickets(sector_id);
