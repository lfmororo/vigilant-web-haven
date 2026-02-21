
-- Table to store individual disks per equipment
CREATE TABLE public.equipment_disks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE CASCADE,
  drive_letter TEXT, -- e.g. "C:", "D:", "/dev/sda1"
  label TEXT, -- e.g. "Sistema", "Dados"
  disk_total_gb NUMERIC,
  disk_used_gb NUMERIC,
  disk_free_gb NUMERIC,
  file_system TEXT, -- e.g. "NTFS", "ext4"
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.equipment_disks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage equipment disks"
  ON public.equipment_disks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can manage equipment disks"
  ON public.equipment_disks FOR ALL
  USING (has_role(auth.uid(), 'technician'::app_role));

CREATE POLICY "Users can view client equipment disks"
  ON public.equipment_disks FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technician'::app_role)
    OR (equipment_id IN (
      SELECT ei.id FROM equipment_inventory ei
      WHERE ei.client_id IN (
        SELECT p.parent_client_id FROM profiles p
        WHERE p.id = auth.uid() AND p.parent_client_id IS NOT NULL
      )
    ))
  );

-- Index for fast lookups
CREATE INDEX idx_equipment_disks_equipment_id ON public.equipment_disks(equipment_id);
