
-- Add disk and recording info to dvr_devices
ALTER TABLE public.dvr_devices
  ADD COLUMN IF NOT EXISTS disk_total_gb numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disk_used_gb numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disk_free_gb numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disk_usage_pct numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recording_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS device_model text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS firmware_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS serial_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_channels integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uptime_seconds bigint DEFAULT NULL;

-- Add recording and detail info to dvr_cameras
ALTER TABLE public.dvr_cameras
  ADD COLUMN IF NOT EXISTS recording_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resolution text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS codec text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fps integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS motion_detect boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_loss boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS camera_type text DEFAULT NULL;
