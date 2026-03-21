
CREATE OR REPLACE FUNCTION public.cleanup_old_mikrotik_history()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  DELETE FROM public.mikrotik_system_history
  WHERE recorded_at < now() - interval '30 days';

  DELETE FROM public.mikrotik_interface_events
  WHERE recorded_at < now() - interval '30 days';
$$;
