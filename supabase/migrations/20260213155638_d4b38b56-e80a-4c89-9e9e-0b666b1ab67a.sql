
-- Add address fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_complement text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;

-- Add new fields to service_orders
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS arrival_date timestamptz;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS departure_date timestamptz;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS travel_cost numeric DEFAULT 0;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS equipment_removed text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS material_used text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_description text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS checked_by text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS technician_signature text;
