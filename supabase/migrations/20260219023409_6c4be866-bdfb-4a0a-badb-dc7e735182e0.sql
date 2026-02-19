ALTER TABLE public.equipment_inventory
  ADD COLUMN IF NOT EXISTS cpu text,
  ADD COLUMN IF NOT EXISTS ram_total_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_total_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_used_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_free_gb numeric,
  ADD COLUMN IF NOT EXISTS hardware_updated_at timestamptz;