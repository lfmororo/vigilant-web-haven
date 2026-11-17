package main

import (
	"time"
)

type Software struct {
	Name        string `json:"name"`
	Version     string `json:"version,omitempty"`
	Publisher   string `json:"publisher,omitempty"`
	InstallDate string `json:"install_date,omitempty"`
}

type Inventory struct {
	Manufacturer string     `json:"manufacturer"`
	Model        string     `json:"model"`
	SerialNumber string     `json:"serial_number"`
	BIOSVersion  string     `json:"bios_version"`
	CPUModel     string     `json:"cpu_model"`
	CPUCores     int        `json:"cpu_cores"`
	RAMTotalGB   float64    `json:"ram_total_gb"`
	Domain       string     `json:"domain"`
	OSName       string     `json:"os_name"`
	OSVersion    string     `json:"os_version"`
	IsLaptop     bool       `json:"is_laptop"`
	MACAddresses []string   `json:"mac_addresses"`
	Software     []Software `json:"software"`
}

func collectInventory(m *HostMetrics) *Inventory {
	inv := &Inventory{CPUModel: m.CPUModel, CPUCores: m.Cores, RAMTotalGB: m.RAMTotalGB, MACAddresses: localMACs()}
	collectOSInventory(inv)
	if inv.Software == nil {
		inv.Software = []Software{}
	}
	return inv
}

// endpointMetrics: formato de `metrics` no report do endpoint-agent.
func endpointMetrics(m *HostMetrics) map[string]any {
	out := map[string]any{
		"cpu_usage_pct":   m.CPUPct,
		"ram_usage_pct":   m.RAMPct,
		"disks":           m.Disks,
		"top_processes":   m.TopProcs,
		"pending_reboot":  m.PendingReboot,
		"uptime_seconds":  m.UptimeSeconds,
		"logged_user":     m.LoggedUser,
		"ip_addresses":    m.IPs,
		"remote_access_id": m.RemoteID,
		"physical_disks":  nonNil(m.PhysicalDisks),
		"antivirus":       nonNil(m.Antivirus),
	}
	if !m.BootTime.IsZero() {
		out["last_boot_time"] = m.BootTime.UTC().Format(time.RFC3339)
	}
	return out
}

func nonNil[T any](v []T) []T {
	if v == nil {
		return []T{}
	}
	return v
}

// windowsIngest: mesmo formato do windows-server-collector.ps1 (type=windows).
func windowsIngest(serverID string, m *HostMetrics) map[string]any {
	var total, free, used, maxPct float64
	maxPct = -1
	disks := make([]map[string]any, 0, len(m.Disks))
	for _, d := range m.Disks {
		total += d.TotalGB
		free += d.FreeGB
		used += d.UsedGB
		if d.UsagePct > maxPct {
			maxPct = d.UsagePct
		}
		disks = append(disks, map[string]any{
			"drive": d.Mount, "label": d.Label, "total_gb": d.TotalGB, "free_gb": d.FreeGB, "used_gb": d.UsedGB,
			"usage_pct": d.UsagePct, "predict_failure": d.Predict,
		})
	}
	p := map[string]any{
		"type": "windows", "server_id": serverID, "status": "online", "agent_version": "mororo-agent " + Version,
		"cpu_usage": m.CPUPct, "cpu_cores": m.Cores, "cpu_model": m.CPUModel,
		"ram_total_gb": m.RAMTotalGB, "ram_used_gb": m.RAMUsedGB, "ram_usage_pct": m.RAMPct,
		"os_version": m.OSName + " " + m.OSVersion, "uptime_seconds": m.UptimeSeconds,
		"disks": disks, "services_status": nonNil(m.Services), "top_processes": nonNil(m.TopProcs),
		"event_errors": nonNil(m.Events), "pending_reboot": m.PendingReboot,
	}
	if !m.BootTime.IsZero() {
		p["last_boot_time"] = m.BootTime.UTC().Format(time.RFC3339)
	}
	if len(m.Disks) > 0 {
		p["disk_total_gb"], p["disk_free_gb"], p["disk_used_gb"], p["disk_usage_pct"] = round1(total), round1(free), round1(used), maxPct
	}
	return p
}

// linuxIngest: mesmo formato do linux-agent.sh (type=linux).
func linuxIngest(serverID string, m *HostMetrics) map[string]any {
	info := map[string]any{
		"hostname": m.Hostname, "distro": m.OSName, "kernel": m.OSVersion, "cpu_model": m.CPUModel, "cpu_cores": m.Cores,
		"cpu_usage_pct": m.CPUPct, "iowait_pct": m.IOWaitPct, "load_1": m.Load1, "load_5": m.Load5, "load_15": m.Load15,
		"ram_total_gb": m.RAMTotalGB, "ram_used_gb": m.RAMUsedGB, "ram_usage_pct": m.RAMPct,
		"swap_total_gb": m.SwapTotalGB, "swap_used_gb": m.SwapUsedGB, "reboot_required": m.PendingReboot,
		"uptime_seconds": m.UptimeSeconds, "agent_version": "mororo-agent " + Version,
	}
	if m.PendingUpdates != nil {
		info["pending_updates"] = *m.PendingUpdates
	}
	if m.SecurityUpdates != nil {
		info["security_updates"] = *m.SecurityUpdates
	}
	disks := make([]map[string]any, 0, len(m.Disks))
	for _, d := range m.Disks {
		e := map[string]any{"mount": d.Mount, "fs": d.FSType, "pct": d.UsagePct, "total_gb": d.TotalGB, "used_gb": d.UsedGB}
		if d.InodePct != nil {
			e["inode_pct"] = *d.InodePct
		}
		disks = append(disks, e)
	}
	ip := ""
	if len(m.IPs) > 0 {
		ip = m.IPs[0]
	}
	info["ip"] = ip
	return map[string]any{
		"type": "linux", "server_id": serverID, "status": "online", "info": info, "disks": disks,
		"services": nonNil(m.Services), "failed_units": nonNil(m.FailedUnits), "raid": nonNil(m.RAID),
		"zfs": nonNil(m.ZFS), "smart": nonNil(m.SMART), "top_processes": nonNil(m.TopProcs),
	}
}
