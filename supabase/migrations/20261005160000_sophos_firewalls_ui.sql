-- Sophos Firewalls (part 2: RLS policies)
-- The tables sophos_firewalls, sophos_telemetry_logs, sophos_alerts
-- were created in 20261005154533_sophos_firewalls.sql

-- RLS is already enabled per project conventions.
-- Enable RLS on all three tables and create policies.

ALTER TABLE sophos_firewalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophos_telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophos_alerts ENABLE ROW LEVEL SECURITY;

-- Admins (has role 'admin') can do everything
CREATE POLICY "admin_full_sophos_firewalls"
  ON sophos_firewalls FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'raw_user_meta_data' ->> 'role' = 'admin');

CREATE POLICY "admin_full_sophos_telemetry"
  ON sophos_telemetry_logs FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'raw_user_meta_data' ->> 'role' = 'admin');

CREATE POLICY "admin_full_sophos_alerts"
  ON sophos_alerts FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'raw_user_meta_data' ->> 'role' = 'admin');

-- Service role can do everything (needed for Edge Functions)
CREATE POLICY "service_role_full_sophos_firewalls"
  ON sophos_firewalls FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "service_role_full_sophos_telemetry"
  ON sophos_telemetry_logs FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "service_role_full_sophos_alerts"
  ON sophos_alerts FOR ALL
  TO service_role
  USING (true);
