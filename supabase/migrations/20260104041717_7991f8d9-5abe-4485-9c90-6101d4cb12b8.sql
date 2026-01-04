-- Add device_ip column to cameras table for direct connection testing
ALTER TABLE public.cameras 
ADD COLUMN device_ip text;

-- Add comment for documentation
COMMENT ON COLUMN public.cameras.device_ip IS 'IP address or hostname for direct device connection';