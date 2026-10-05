import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { clients } from "./extended-schema";

// ─── Sophos Firewalls ────────────────────────────────────────────────────────

export const sophosFirewalls = pgTable("sophos_firewalls", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  serialNumber: text("serial_number"),
  model: text("model"),
  firmwareVersion: text("firmware_version"),
  apiToken: text("api_token").unique().notNull(),
  sophosIp: text("sophos_ip"),
  status: text("status").$type<"online" | "offline" | "warning">().default("offline").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SophosFirewall = typeof sophosFirewalls.$inferSelect;
export type NewSophosFirewall = typeof sophosFirewalls.$inferInsert;

// ─── Sophos Telemetry Logs ───────────────────────────────────────────────────

export interface SophosInterface {
  name: string;
  status: "up" | "down";
  ip?: string;
  rxMbps?: number;
  txMbps?: number;
}

export interface SophosVpnTunnel {
  name: string;
  type: "ipsec" | "ssl";
  status: "connected" | "disconnected";
  localSubnet?: string;
  remoteSubnet?: string;
}

export const sophosTelemetryLogs = pgTable("sophos_telemetry_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  firewallId: uuid("firewall_id").references(() => sophosFirewalls.id, { onDelete: "cascade" }).notNull(),
  cpuUsage: integer("cpu_usage"),
  memoryUsage: integer("memory_usage"),
  diskUsage: integer("disk_usage"),
  interfaces: jsonb("interfaces").$type<SophosInterface[]>(),
  vpnTunnels: jsonb("vpn_tunnels").$type<SophosVpnTunnel[]>(),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SophosTelemetryLog = typeof sophosTelemetryLogs.$inferSelect;
export type NewSophosTelemetryLog = typeof sophosTelemetryLogs.$inferInsert;

// ─── Sophos Alerts ────────────────────────────────────────────────────────────

export const sophosAlerts = pgTable("sophos_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  firewallId: uuid("firewall_id").references(() => sophosFirewalls.id, { onDelete: "cascade" }).notNull(),
  severity: text("severity").$type<"info" | "warning" | "critical">().notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SophosAlert = typeof sophosAlerts.$inferSelect;
export type NewSophosAlert = typeof sophosAlerts.$inferInsert;
