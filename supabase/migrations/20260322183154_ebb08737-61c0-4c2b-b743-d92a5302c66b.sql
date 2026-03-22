
-- DVR devices table
CREATE TABLE public.dvr_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 80,
  username text NOT NULL DEFAULT 'admin',
  password text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  last_error text,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dvr_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dvr devices" ON public.dvr_devices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view dvr devices" ON public.dvr_devices FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));

-- DVR cameras table
CREATE TABLE public.dvr_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dvr_id uuid REFERENCES public.dvr_devices(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  channel integer NOT NULL DEFAULT 1,
  rtsp_url text,
  status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dvr_cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dvr cameras" ON public.dvr_cameras FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view dvr cameras" ON public.dvr_cameras FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));

-- DVR event history
CREATE TABLE public.dvr_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dvr_id uuid REFERENCES public.dvr_devices(id) ON DELETE CASCADE NOT NULL,
  camera_id uuid REFERENCES public.dvr_cameras(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dvr_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dvr events" ON public.dvr_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view dvr events" ON public.dvr_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
