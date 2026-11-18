// Tipos e formatadores do Monitor MikroTik/SNMP.
export interface MikrotikDevice {
  id: string;
  client_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  use_ssl: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
  proxy_url: string | null;
  api_port: number | null;
  device_type: string;
  snmp_community: string | null;
  snmp_version: string | null;
  snmp_security_level: string | null;
  snmp_user: string | null;
  snmp_auth_protocol: string | null;
  snmp_auth_passphrase: string | null;
  snmp_priv_protocol: string | null;
  snmp_priv_passphrase: string | null;
  client?: { full_name: string };
  last_dhcp_summary?: any;
  last_log_alerts?: any[];
  last_system_info?: any;
}

export interface MikrotikInterface {
  id: string;
  device_id: string;
  interface_name: string;
  interface_type: string | null;
  status: string;
  running: boolean;
  disabled: boolean;
  mac_address: string | null;
  tx_rate: number;
  rx_rate: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_packets: number;
  rx_packets: number;
  tx_errors: number;
  rx_errors: number;
  tx_drops: number;
  rx_drops: number;
  speed: string | null;
  ip_address: string | null;
  uptime: string | null;
  pppoe_user: string | null;
  pppoe_service: string | null;
  updated_at: string;
}

export interface PingTarget {
  id: string;
  device_id: string;
  target_ip: string;
  label: string;
  is_active: boolean;
  latency_ms: number | null;
  packet_loss_pct: number | null;
  last_checked_at: string | null;
}

export interface Client {
  id: string;
  full_name: string;
}

export const emptyDevice = {
  name: "", host: "", port: 443, username: "admin", password: "", use_ssl: true, client_id: "", proxy_url: "", api_port: 8728, device_type: "mikrotik", snmp_community: "public", snmp_version: "2c",
  snmp_security_level: "noAuthNoPriv", snmp_user: "", snmp_auth_protocol: "MD5", snmp_auth_passphrase: "", snmp_priv_protocol: "DES", snmp_priv_passphrase: "",
};

export const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const formatBitsPerSec = (bps: number) => {
  if (!bps || bps === 0) return "0 bps";
  if (bps >= 1_000_000_000) return (bps / 1_000_000_000).toFixed(2) + " Gbps";
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(2) + " Mbps";
  if (bps >= 1_000) return (bps / 1_000).toFixed(1) + " Kbps";
  return bps + " bps";
};

