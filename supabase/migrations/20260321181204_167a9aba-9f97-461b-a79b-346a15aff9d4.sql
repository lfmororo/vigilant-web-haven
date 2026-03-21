ALTER TABLE public.mikrotik_devices
  ADD COLUMN snmp_security_level text DEFAULT 'noAuthNoPriv',
  ADD COLUMN snmp_user text,
  ADD COLUMN snmp_auth_protocol text DEFAULT 'MD5',
  ADD COLUMN snmp_auth_passphrase text,
  ADD COLUMN snmp_priv_protocol text DEFAULT 'DES',
  ADD COLUMN snmp_priv_passphrase text;