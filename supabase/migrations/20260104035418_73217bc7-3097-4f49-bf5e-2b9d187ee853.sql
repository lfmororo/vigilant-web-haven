-- Add serial_number column
ALTER TABLE public.cameras ADD COLUMN serial_number text;

-- Rename intelbras columns to device columns
ALTER TABLE public.cameras RENAME COLUMN intelbras_username TO device_username;
ALTER TABLE public.cameras RENAME COLUMN intelbras_password TO device_password;

-- Make embed_url nullable (will be generated from serial)
ALTER TABLE public.cameras ALTER COLUMN embed_url DROP NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.cameras.serial_number IS 'Serial number of the Intelbras device for P2P connection';
COMMENT ON COLUMN public.cameras.device_username IS 'Username for device authentication';
COMMENT ON COLUMN public.cameras.device_password IS 'Password for device authentication';