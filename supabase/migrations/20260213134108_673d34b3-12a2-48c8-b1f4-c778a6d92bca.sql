
-- Create equipment_status enum
CREATE TYPE public.equipment_status AS ENUM ('active', 'inactive', 'maintenance', 'retired');

-- Create equipment_inventory table
CREATE TABLE public.equipment_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  equipment_type_id UUID REFERENCES public.equipment_types(id),
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  client_id UUID REFERENCES public.profiles(id),
  location TEXT,
  status public.equipment_status NOT NULL DEFAULT 'active',
  purchase_date DATE,
  warranty_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.equipment_inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage equipment inventory"
ON public.equipment_inventory
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Technicians can manage equipment inventory"
ON public.equipment_inventory
FOR ALL
USING (public.has_role(auth.uid(), 'technician'));

CREATE POLICY "Clients can view own equipment"
ON public.equipment_inventory
FOR SELECT
USING (client_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_equipment_inventory_updated_at
BEFORE UPDATE ON public.equipment_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing 'user' roles to 'client'
UPDATE public.user_roles SET role = 'client' WHERE role = 'user';
