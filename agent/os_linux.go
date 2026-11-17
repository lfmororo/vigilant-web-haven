//go:build linux

package main

import (
	"bufio"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func isWindowsService() bool { return false }

func osMachineID() string {
	for _, p := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
		if b, err := os.ReadFile(p); err == nil {
			if s := strings.TrimSpace(string(b)); s != "" {
				return s
			}
		}
	}
	return ""
}

func restrictConfigACL(path string) { _ = os.Chmod(path, 0o600) }

func restrictDirACL(dir string) { _ = os.Chmod(dir, 0o700) }

func hiddenCmd(name string, args ...string) *exec.Cmd { return exec.Command(name, args...) }

func run(timeout time.Duration, name string, args ...string) string {
	if _, err := exec.LookPath(name); err != nil {
		return ""
	}
	cmd := exec.Command(name, args...)
	done := make(chan struct{})
	var out []byte
	go func() { out, _ = cmd.Output(); close(done) }()
	select {
	case <-done:
		return string(out)
	case <-time.After(timeout):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		return ""
	}
}

func readTrim(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// ---------------------------------------------------------------- métricas

func collectOSMetrics(m *HostMetrics, c *Config) {
	if pn := osPrettyName(); pn != "" {
		m.OSName = pn
	}
	for _, s := range c.services() {
		st := strings.TrimSpace(run(10*time.Second, "systemctl", "is-active", s))
		if st == "" {
			st = "unknown"
		}
		m.Services = append(m.Services, ServiceInfo{Name: s, Status: st})
	}
	for _, line := range strings.Split(run(15*time.Second, "systemctl", "list-units", "--failed", "--plain", "--no-legend", "--no-pager"), "\n") {
		f := strings.Fields(line)
		if len(f) > 0 && strings.Contains(f[0], ".") {
			m.FailedUnits = append(m.FailedUnits, f[0])
		}
	}
	_, err := os.Stat("/var/run/reboot-required")
	m.PendingReboot = err == nil
	m.PendingUpdates, m.SecurityUpdates = linuxUpdates()
	m.RAID = linuxRAID()
	m.ZFS = linuxZFS()
	m.SMART = linuxSMART()
	for _, s := range m.SMART {
		if p, ok := s["passed"].(bool); ok && !p {
			m.PhysicalDisks = append(m.PhysicalDisks, PhysDisk{Name: s["device"].(string), Health: "Unhealthy", Predict: true})
		}
	}
	if w := strings.Fields(run(5*time.Second, "who")); len(w) > 0 {
		m.LoggedUser = w[0]
	}
	m.RemoteID = linuxRemoteID()
}

func osIdentity() (string, string) { return osPrettyName(), readTrim("/proc/sys/kernel/osrelease") }

func osPrettyName() string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "PRETTY_NAME="); ok {
			return strings.Trim(v, `"`)
		}
	}
	return ""
}

var updatesCache struct {
	at        time.Time
	pending   *int
	security  *int
}

// Atualizações pendentes (apt/dnf), no máximo 1 consulta a cada 6 h.
func linuxUpdates() (*int, *int) {
	if time.Since(updatesCache.at) < 6*time.Hour {
		return updatesCache.pending, updatesCache.security
	}
	updatesCache.at = time.Now()
	if out := run(90*time.Second, "apt-get", "-s", "-o", "Debug::NoLocking=1", "upgrade"); out != "" {
		p, s := 0, 0
		for _, l := range strings.Split(out, "\n") {
			if strings.HasPrefix(l, "Inst ") {
				p++
				if strings.Contains(strings.ToLower(l), "security") {
					s++
				}
			}
		}
		updatesCache.pending, updatesCache.security = &p, &s
	} else if _, err := exec.LookPath("dnf"); err == nil {
		out := run(120*time.Second, "dnf", "-q", "check-update")
		p := 0
		for _, l := range strings.Split(out, "\n") {
			if f := strings.Fields(l); len(f) == 3 && strings.Contains(f[0], ".") {
				p++
			}
		}
		sec := 0
		for _, l := range strings.Split(run(120*time.Second, "dnf", "-q", "updateinfo", "list", "--security"), "\n") {
			if strings.TrimSpace(l) != "" {
				sec++
			}
		}
		updatesCache.pending, updatesCache.security = &p, &sec
	}
	return updatesCache.pending, updatesCache.security
}

var reMd = regexp.MustCompile(`^(md\d+)\s*:\s*(\w+)`)
var reMdStatus = regexp.MustCompile(`\[([U_]+)\]`)

func linuxRAID() []map[string]any {
	f, err := os.Open("/proc/mdstat")
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []map[string]any
	var cur map[string]any
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		l := sc.Text()
		if m := reMd.FindStringSubmatch(l); m != nil {
			cur = map[string]any{"device": m[1], "state": m[2], "degraded": false}
			out = append(out, cur)
			continue
		}
		if cur != nil {
			if m := reMdStatus.FindStringSubmatch(l); m != nil {
				cur["members"] = m[1]
				if strings.Contains(m[1], "_") {
					cur["degraded"] = true
					cur["state"] = "degraded"
				}
			}
		}
	}
	return out
}

func linuxZFS() []map[string]any {
	out := run(15*time.Second, "zpool", "list", "-H", "-o", "name,health,capacity")
	var res []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.Split(l, "\t")
		if len(f) < 3 {
			continue
		}
		capPct, _ := strconv.ParseFloat(strings.TrimSuffix(f[2], "%"), 64)
		z := map[string]any{"name": f[0], "health": f[1], "capacity_pct": capPct}
		if f[1] != "ONLINE" {
			z["errors"] = strings.TrimSpace(run(15*time.Second, "zpool", "status", "-x", f[0]))
		}
		res = append(res, z)
	}
	return res
}

func linuxSMART() []map[string]any {
	scan := run(20*time.Second, "smartctl", "--scan")
	var out []map[string]any
	for _, l := range strings.Split(scan, "\n") {
		f := strings.Fields(l)
		if len(f) == 0 || !strings.HasPrefix(f[0], "/dev/") {
			continue
		}
		args := []string{"-H", f[0]}
		if len(f) >= 3 && f[1] == "-d" {
			args = []string{"-H", "-d", f[2], f[0]}
		}
		h := run(20*time.Second, "smartctl", args...)
		passed := true
		result := ""
		for _, hl := range strings.Split(h, "\n") {
			low := strings.ToLower(hl)
			if strings.Contains(low, "overall-health") || strings.Contains(low, "health status") {
				result = strings.TrimSpace(hl)
				if !strings.Contains(low, "passed") && !strings.Contains(low, "ok") {
					passed = false
				}
			}
		}
		if result != "" {
			out = append(out, map[string]any{"device": f[0], "passed": passed, "result": result})
		}
	}
	return out
}

func linuxRemoteID() string {
	for _, p := range []string{"/root/.config/rustdesk/RustDesk.toml"} {
		if b, err := os.ReadFile(p); err == nil {
			for _, l := range strings.Split(string(b), "\n") {
				if v, ok := strings.CutPrefix(strings.TrimSpace(l), "id = "); ok {
					return "RustDesk " + strings.Trim(v, `'"`)
				}
			}
		}
	}
	return ""
}

func listLocalServices() []ServiceInfo {
	out := run(15*time.Second, "systemctl", "list-units", "--type=service", "--all", "--plain", "--no-legend", "--no-pager")
	var res []ServiceInfo
	for _, l := range strings.Split(out, "\n") {
		f := strings.Fields(l)
		if len(f) < 4 {
			continue
		}
		name := strings.TrimSuffix(f[0], ".service")
		res = append(res, ServiceInfo{Name: name, DisplayName: strings.Join(f[4:], " "), Status: f[3], StartMode: f[2]})
	}
	return res
}

// ---------------------------------------------------------------- inventário

func collectOSInventory(inv *Inventory) {
	d := "/sys/class/dmi/id/"
	inv.Manufacturer = readTrim(d + "sys_vendor")
	inv.Model = readTrim(d + "product_name")
	inv.SerialNumber = readTrim(d + "product_serial")
	inv.BIOSVersion = readTrim(d + "bios_version")
	if ct, _ := strconv.Atoi(readTrim(d + "chassis_type")); ct == 8 || ct == 9 || ct == 10 || ct == 14 || ct == 31 {
		inv.IsLaptop = true
	}
	inv.Domain = strings.TrimSpace(run(5*time.Second, "hostname", "-d"))
	inv.OSName = osPrettyName()
	inv.OSVersion = readTrim("/proc/sys/kernel/osrelease")

	if out := run(60*time.Second, "dpkg-query", "-W", "-f", "${Package}\t${Version}\t${Maintainer}\n"); out != "" {
		for _, l := range strings.Split(out, "\n") {
			f := strings.Split(l, "\t")
			if len(f) >= 2 && f[0] != "" {
				s := Software{Name: f[0], Version: f[1]}
				if len(f) > 2 {
					s.Publisher = f[2]
				}
				inv.Software = append(inv.Software, s)
			}
		}
	} else if out := run(60*time.Second, "rpm", "-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n"); out != "" {
		for _, l := range strings.Split(out, "\n") {
			f := strings.Split(l, "\t")
			if len(f) >= 2 && f[0] != "" {
				inv.Software = append(inv.Software, Software{Name: f[0], Version: f[1], Publisher: f[min(2, len(f)-1)]})
			}
		}
	}
}
