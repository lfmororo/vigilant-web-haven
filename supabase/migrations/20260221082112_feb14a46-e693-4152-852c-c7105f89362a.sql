-- Drop RLS policies on cameras
DROP POLICY IF EXISTS "Admins can manage cameras" ON public.cameras;
DROP POLICY IF EXISTS "Users can view assigned cameras" ON public.cameras;

-- Drop RLS policies on user_cameras
DROP POLICY IF EXISTS "Admins can manage user_cameras" ON public.user_cameras;
DROP POLICY IF EXISTS "Users can view own camera assignments" ON public.user_cameras;

-- Drop tables
DROP TABLE IF EXISTS public.user_cameras;
DROP TABLE IF EXISTS public.cameras;