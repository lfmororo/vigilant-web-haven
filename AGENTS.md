# Project rules

- Credential columns (`password`, `token_secret`) of `vmware_hosts`, `ilo_servers`, `sql_instances` and `proxmox_nodes` are not readable by `authenticated`; SELECT is granted per column. When adding a column to these tables, also `GRANT SELECT (new_col) ... TO authenticated`, or the screens fail — why: keeps device credentials out of the browser.
- Monitoring collectors authenticate with `x-monitor-token` (sha256 stored in `monitor_agent_tokens`); `MONITOR_REQUIRE_TOKEN=true` rejects tokenless ingestion — why: the anon key is public.
