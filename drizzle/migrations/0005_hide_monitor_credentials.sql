-- Um REVOKE só de coluna não tem efeito enquanto existir o GRANT SELECT da tabela inteira.
-- Por isso: tira o SELECT da tabela e devolve coluna a coluna, sem as credenciais.
REVOKE SELECT ON public.vmware_hosts, public.ilo_servers, public.sql_instances, public.proxmox_nodes FROM authenticated, anon;
REVOKE SELECT (password) ON public.vmware_hosts, public.ilo_servers, public.sql_instances FROM authenticated, anon;
REVOKE SELECT (password, token_secret) ON public.proxmox_nodes FROM authenticated, anon;

GRANT SELECT (id,client_id,name,host,username,port,status,is_active,cpu_cores,cpu_usage_pct,ram_total_gb,ram_used_gb,ram_usage_pct,esxi_version,uptime_seconds,datastores,last_polled_at,last_error,created_at,updated_at,thresholds,consecutive_failures,last_success_at)
  ON public.vmware_hosts TO authenticated;

GRANT SELECT (id,client_id,name,host,port,username,is_active,status,health_summary,power_state,post_state,indicator_led,server_model,serial_number,ilo_version,ilo_firmware,bios_version,cpu_model,cpu_count,ram_total_gb,health_processor,health_memory,health_storage,health_fans,health_power,health_temperature,health_network,uptime_seconds,last_polled_at,last_error,created_at,updated_at,vendor,consecutive_failures,last_success_at,thresholds)
  ON public.ilo_servers TO authenticated;

GRANT SELECT (id,client_id,windows_server_id,name,instance,auth_mode,username,is_active,status,version,edition,uptime_seconds,sql_cpu_pct,ple_seconds,buffer_cache_hit_pct,batch_requests_sec,user_connections,blocked_sessions,longest_block_seconds,long_running_queries,databases,failed_jobs,top_waits,io_latency,agent_running,max_server_memory_mb,memory_used_mb,agent_version,thresholds,consecutive_failures,last_success_at,last_polled_at,last_error,created_at,updated_at)
  ON public.sql_instances TO authenticated;

GRANT SELECT (id,client_id,name,host,port,node_name,auth_mode,username,token_name,is_active,status,pve_version,cpu_model,cpu_cores,cpu_usage_pct,ram_total_gb,ram_used_gb,ram_usage_pct,swap_total_gb,swap_used_gb,disk_total_gb,disk_used_gb,disk_usage_pct,load_avg,uptime_seconds,storages,last_polled_at,last_error,created_at,updated_at,thresholds,consecutive_failures,last_success_at,iowait_pct)
  ON public.proxmox_nodes TO authenticated;