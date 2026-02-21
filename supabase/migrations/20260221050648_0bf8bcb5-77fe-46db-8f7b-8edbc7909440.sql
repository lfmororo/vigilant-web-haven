
ALTER TABLE public.tickets ADD COLUMN equipment_id uuid REFERENCES public.equipment_inventory(id) ON DELETE SET NULL;
