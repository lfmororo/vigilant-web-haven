
CREATE OR REPLACE FUNCTION public.cleanup_old_dhcp_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.mikrotik_dhcp_history
  WHERE recorded_at < now() - interval '30 days';
$$;
