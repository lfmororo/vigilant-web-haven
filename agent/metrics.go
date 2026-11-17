package main

import (
	"math"
	"net"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
)

type DiskInfo struct {
	Mount     string  `json:"mount"`
	Label     string  `json:"label,omitempty"`
	FSType    string  `json:"fstype,omitempty"`
	TotalGB   float64 `json:"total_gb"`
	UsedGB    float64 `json:"used_gb"`
	FreeGB    float64 `json:"free_gb"`
	UsagePct  float64 `json:"usage_pct"`
	InodePct  *float64 `json:"inode_pct,omitempty"`
	Predict   bool    `json:"predict_failure,omitempty"`
}

type ProcInfo struct {
	Name   string  `json:"name"`
	PID    int32   `json:"pid"`
	By     string  `json:"by"`
	CPUPct float64 `json:"cpu_pct"`
	MemMB  float64 `json:"mem_mb"`
}

type ServiceInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name,omitempty"`
	Status      string `json:"status"`
	StartMode   string `json:"start_mode,omitempty"`
}

type EventInfo struct {
	Level   string `json:"level"`
	Source  string `json:"source"`
	EventID int    `json:"event_id"`
	Time    string `json:"time"`
	Message string `json:"message"`
}

type PhysDisk struct {
	Name     string `json:"name"`
	Model    string `json:"model,omitempty"`
	Serial   string `json:"serial,omitempty"`
	Media    string `json:"media,omitempty"`
	SizeGB   float64 `json:"size_gb,omitempty"`
	Health   string `json:"health,omitempty"`
	Predict  bool   `json:"predict_failure"`
}

type Antivirus struct {
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	UpToDate bool   `json:"up_to_date"`
}

type HostMetrics struct {
	Hostname        string
	OSName          string
	OSVersion       string
	CPUPct          *float64
	IOWaitPct       *float64
	CPUModel        string
	Cores           int
	RAMTotalGB      float64
	RAMUsedGB       float64
	RAMPct          float64
	SwapTotalGB     float64
	SwapUsedGB      float64
	Load1, Load5, Load15 *float64
	UptimeSeconds   uint64
	BootTime        time.Time
	Disks           []DiskInfo
	TopProcs        []ProcInfo
	Services        []ServiceInfo
	FailedUnits     []string
	Events          []EventInfo
	PendingReboot   bool
	PendingUpdates  *int
	SecurityUpdates *int
	PhysicalDisks   []PhysDisk
	Antivirus       []Antivirus
	LoggedUser      string
	IPs             []string
	RemoteID        string
	RAID            []map[string]any
	ZFS             []map[string]any
	SMART           []map[string]any
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
func gb(b uint64) float64      { return round1(float64(b) / (1 << 30)) }
func f64p(v float64) *float64  { return &v }

// collectMetrics junta o que é comum (gopsutil) com o específico do sistema.
func collectMetrics(c *Config) *HostMetrics {
	m := &HostMetrics{}
	m.Hostname, _ = os.Hostname()

	if hi, err := host.Info(); err == nil {
		m.OSName = strings.TrimSpace(hi.Platform + " " + hi.PlatformVersion)
		m.OSVersion = hi.KernelVersion
		m.UptimeSeconds = hi.Uptime
		m.BootTime = time.Unix(int64(hi.BootTime), 0)
	}

	// CPU: amostra de 3 s (inclui iowait no Linux).
	t1, _ := cpu.Times(false)
	if p, err := cpu.Percent(3*time.Second, false); err == nil && len(p) > 0 {
		m.CPUPct = f64p(round1(p[0]))
	}
	t2, _ := cpu.Times(false)
	if len(t1) > 0 && len(t2) > 0 {
		total := t2[0].Total() - t1[0].Total()
		if total > 0 && (t2[0].Iowait-t1[0].Iowait) >= 0 {
			m.IOWaitPct = f64p(round1((t2[0].Iowait - t1[0].Iowait) / total * 100))
		}
	}
	if ci, err := cpu.Info(); err == nil && len(ci) > 0 {
		m.CPUModel = strings.TrimSpace(ci[0].ModelName)
	}
	if n, err := cpu.Counts(true); err == nil {
		m.Cores = n
	}

	if vm, err := mem.VirtualMemory(); err == nil {
		m.RAMTotalGB = gb(vm.Total)
		m.RAMUsedGB = gb(vm.Total - vm.Available)
		if vm.Total > 0 {
			m.RAMPct = round1(float64(vm.Total-vm.Available) / float64(vm.Total) * 100)
		}
	}
	if sw, err := mem.SwapMemory(); err == nil {
		m.SwapTotalGB = gb(sw.Total)
		m.SwapUsedGB = gb(sw.Used)
	}
	if l, err := load.Avg(); err == nil && l != nil && (l.Load1 > 0 || l.Load5 > 0 || l.Load15 > 0) {
		m.Load1, m.Load5, m.Load15 = f64p(round1(l.Load1)), f64p(round1(l.Load5)), f64p(round1(l.Load15))
	}

	m.Disks = collectDisks()
	m.TopProcs = topProcesses(m.Cores)
	m.IPs = localIPs()
	collectOSMetrics(m, c)
	return m
}

var skipFS = map[string]bool{
	"tmpfs": true, "devtmpfs": true, "squashfs": true, "overlay": true, "proc": true, "sysfs": true,
	"cgroup": true, "cgroup2": true, "autofs": true, "devpts": true, "mqueue": true, "debugfs": true,
	"tracefs": true, "securityfs": true, "pstore": true, "bpf": true, "configfs": true, "fusectl": true,
	"hugetlbfs": true, "nsfs": true, "ramfs": true, "efivarfs": true, "binfmt_misc": true, "fuse.lxcfs": true,
	"nfs": true, "nfs4": true, "cifs": true, "smbfs": true, "iso9660": true, "udf": true, "zfs": true,
}

func collectDisks() []DiskInfo {
	parts, err := disk.Partitions(false)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []DiskInfo
	for _, p := range parts {
		if skipFS[strings.ToLower(p.Fstype)] || seen[p.Mountpoint] {
			continue
		}
		if strings.HasPrefix(p.Mountpoint, "/snap/") || strings.HasPrefix(p.Mountpoint, "/boot/efi") || strings.HasPrefix(p.Mountpoint, "/run") {
			continue
		}
		u, err := disk.Usage(p.Mountpoint)
		if err != nil || u.Total < 1<<30 { // ignora < 1 GB
			continue
		}
		seen[p.Mountpoint] = true
		d := DiskInfo{
			Mount: strings.TrimRight(p.Mountpoint, `\`), FSType: p.Fstype,
			TotalGB: gb(u.Total), UsedGB: gb(u.Used), FreeGB: gb(u.Free), UsagePct: round1(u.UsedPercent),
		}
		if u.InodesTotal > 0 {
			d.InodePct = f64p(round1(u.InodesUsedPercent))
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Mount < out[j].Mount })
	return out
}

func topProcesses(cores int) []ProcInfo {
	procs, err := process.Processes()
	if err != nil {
		return nil
	}
	type pinfo struct {
		name string
		pid  int32
		cpu  float64
		mem  float64
	}
	var list []pinfo
	for _, p := range procs {
		name, err := p.Name()
		if err != nil || name == "" || name == "System Idle Process" || name == "Idle" {
			continue
		}
		cpuPct, _ := p.CPUPercent() // média desde o início do processo
		var memMB float64
		if mi, err := p.MemoryInfo(); err == nil && mi != nil {
			memMB = float64(mi.RSS) / (1 << 20)
		}
		list = append(list, pinfo{name, p.Pid, cpuPct, memMB})
	}
	div := float64(cores)
	if div <= 0 {
		div = 1
	}
	var out []ProcInfo
	sort.Slice(list, func(i, j int) bool { return list[i].cpu > list[j].cpu })
	for i := 0; i < len(list) && i < 5; i++ {
		out = append(out, ProcInfo{list[i].name, list[i].pid, "cpu", round1(list[i].cpu / div), round1(list[i].mem)})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].mem > list[j].mem })
	for i := 0; i < len(list) && i < 5; i++ {
		out = append(out, ProcInfo{list[i].name, list[i].pid, "memory", round1(list[i].cpu / div), round1(list[i].mem)})
	}
	return out
}

// localIPs: IPv4 das interfaces ativas (sem loopback, link-local e redes virtuais comuns).
func localIPs() []string {
	ifs, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []string
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		n := strings.ToLower(ifc.Name)
		if strings.HasPrefix(n, "docker") || strings.HasPrefix(n, "veth") || strings.HasPrefix(n, "br-") || strings.Contains(n, "vethernet") || strings.Contains(n, "virtualbox") || strings.Contains(n, "vmware") {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil || ipn.IP.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, ipn.IP.String())
		}
	}
	return out
}

func localMACs() []string {
	ifs, _ := net.Interfaces()
	var out []string
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagLoopback != 0 || len(ifc.HardwareAddr) == 0 {
			continue
		}
		n := strings.ToLower(ifc.Name)
		if strings.HasPrefix(n, "docker") || strings.HasPrefix(n, "veth") || strings.HasPrefix(n, "br-") {
			continue
		}
		out = append(out, strings.ToUpper(ifc.HardwareAddr.String()))
	}
	return out
}
