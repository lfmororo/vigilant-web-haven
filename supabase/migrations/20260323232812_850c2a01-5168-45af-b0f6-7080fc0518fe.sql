
-- Windows Servers table
CREATE TABLE public.windows_servers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  is_active boolean NOT NULL DEFAULT true,
  cpu_usage numeric NULL,
  ram_total_gb numeric NULL,
  ram_used_gb numeric NULL,
  ram_usage_pct numeric NULL,
  disk_total_gb numeric NULL,
  disk_used_gb numeric NULL,
  disk_free_gb numeric NULL,
  disk_usage_pct numeric NULL,
  uptime_seconds bigint NULL,
  last_boot_time timestamp with time zone NULL,
  os_version text NULL,
  services_status jsonb NULL DEFAULT '[]'::jsonb,
  last_polled_at timestamp with time zone NULL,
  last_error text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.windows_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage windows servers" ON public.windows_servers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view windows servers" ON public.windows_servers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));

-- VMware Hosts table
CREATE TABLE public.vmware_hosts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  username text NOT NULL DEFAULT 'root',
  password text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 443,
  status text NOT NULL DEFAULT 'unknown',
  is_active boolean NOT NULL DEFAULT true,
  cpu_cores integer NULL,
  cpu_usage_pct numeric NULL,
  ram_total_gb numeric NULL,
  ram_used_gb numeric NULL,
  ram_usage_pct numeric NULL,
  esxi_version text NULL,
  uptime_seconds bigint NULL,
  datastores jsonb NULL DEFAULT '[]'::jsonb,
  last_polled_at timestamp with time zone NULL,
  last_error text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vmware_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vmware hosts" ON public.vmware_hosts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view vmware hosts" ON public.vmware_hosts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));

-- VMware VMs table
CREATE TABLE public.vmware_vms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES public.vmware_hosts(id) ON DELETE CASCADE,
  name text NOT NULL,
  power_state text NOT NULL DEFAULT 'unknown',
  guest_os text NULL,
  cpu_count integer NULL,
  ram_mb integer NULL,
  ip_address text NULL,
  tools_status text NULL,
  disk_used_gb numeric NULL,
  disk_provisioned_gb numeric NULL,
  uptime_seconds bigint NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vmware_vms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vmware vms" ON public.vmware_vms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view vmware vms" ON public.vmware_vms FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));
