-- Add channel column for DVR/NVR with multiple cameras
ALTER TABLE public.cameras ADD COLUMN channel integer DEFAULT 1;

-- Add comment for clarity
COMMENT ON COLUMN public.cameras.channel IS 'Channel number for DVR/NVR devices (1-based index)';