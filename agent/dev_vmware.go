package main

import (
	"bytes"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// Porte do public/vmware-collector.js: ESXi standalone via SSH (vim-cmd / esxcli).

func vmwareSSHPort(d map[string]any) int {
	p := ival(d, "port", 22)
	if p == 443 || p == 80 || p == 902 {
		return 22 // a coluna `port` costuma guardar a porta web; o coletor usa SSH
	}
	return p
}

func sshDial(host string, port int, user, pass string) (*ssh.Client, error) {
	cfg := &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.Password(pass),
			ssh.KeyboardInteractive(func(_, _ string, qs []string, _ []bool) ([]string, error) {
				ans := make([]string, len(qs))
				for i := range ans {
					ans[i] = pass
				}
				return ans, nil
			}),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // mesmo comportamento do coletor anterior
		Timeout:         20 * time.Second,
		Config: ssh.Config{
			KeyExchanges: []string{"curve25519-sha256", "curve25519-sha256@libssh.org", "ecdh-sha2-nistp256", "ecdh-sha2-nistp384",
				"diffie-hellman-group14-sha256", "diffie-hellman-group14-sha1", "diffie-hellman-group-exchange-sha256", "diffie-hellman-group1-sha1"},
			Ciphers: []string{"aes128-gcm@openssh.com", "chacha20-poly1305@openssh.com", "aes128-ctr", "aes192-ctr", "aes256-ctr", "aes128-cbc"},
		},
		HostKeyAlgorithms: []string{"ssh-ed25519", "ecdsa-sha2-nistp256", "rsa-sha2-256", "rsa-sha2-512", "ssh-rsa"},
	}
	return ssh.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(port)), cfg)
}

func sshRun(c *ssh.Client, cmd string) string {
	s, err := c.NewSession()
	if err != nil {
		return ""
	}
	defer s.Close()
	var out bytes.Buffer
	s.Stdout = &out
	done := make(chan struct{})
	go func() { _ = s.Run(cmd); close(done) }()
	select {
	case <-done:
	case <-time.After(60 * time.Second):
	}
	return out.String()
}

var reVMLine = regexp.MustCompile(`^(\d+)\s+(\S+)\s+\[([^\]]+)\]\s+(\S+)\s+(\S+)`)

func esxGet(raw, key string) string {
	re := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(key) + `\s*=\s*(.+?)\s*,`)
	if m := re.FindStringSubmatch(raw); m != nil {
		return strings.Trim(strings.TrimSpace(m[1]), `"`)
	}
	return ""
}

func collectVMware(d map[string]any) map[string]any {
	id := sval(d, "id")
	c, err := sshDial(sval(d, "host"), vmwareSSHPort(d), sval(d, "username"), sval(d, "password"))
	if err != nil {
		return offline("vmware", "host_id", id, "SSH: "+simplifyNetErr(err).Error())
	}
	defer c.Close()

	vmList := sshRun(c, "vim-cmd vmsvc/getallvms")
	vms := []map[string]any{}
	lines := strings.Split(vmList, "\n")
	if len(lines) > 0 {
		lines = lines[1:]
	}
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		var vmid, name, guestOS string
		if m := reVMLine.FindStringSubmatch(l); m != nil {
			vmid, name, guestOS = m[1], m[2], m[5]
		} else {
			f := strings.Fields(l)
			if len(f) < 2 {
				continue
			}
			vmid, name = f[0], f[1]
			if len(f) > 4 {
				guestOS = f[4]
			}
		}
		if _, err := strconv.Atoi(vmid); err != nil {
			continue
		}
		power := sshRun(c, "vim-cmd vmsvc/power.getstate "+vmid)
		ps := "unknown"
		switch {
		case strings.Contains(power, "Powered on"):
			ps = "poweredOn"
		case strings.Contains(power, "Powered off"):
			ps = "poweredOff"
		case strings.Contains(power, "Suspended"):
			ps = "suspended"
		}
		sum := sshRun(c, "vim-cmd vmsvc/get.summary "+vmid)
		vm := map[string]any{"name": name, "power_state": ps, "guest_os": guestOS}
		if n, err := strconv.Atoi(esxGet(sum, "numCpu")); err == nil {
			vm["cpu_count"] = n
		}
		if n, err := strconv.Atoi(esxGet(sum, "memorySizeMB")); err == nil {
			vm["ram_mb"] = n
		}
		if ip := firstNonEmpty(esxGet(sum, "ipAddress"), esxGet(sum, "guest.ipAddress")); ip != "" && !strings.Contains(ip, "unset") {
			vm["ip_address"] = ip
		}
		if g := esxGet(sum, "guestFullName"); g != "" && !strings.Contains(g, "unset") {
			vm["guest_os"] = g
		}
		if t := firstNonEmpty(esxGet(sum, "toolsStatus"), esxGet(sum, "toolsRunningStatus")); t != "" {
			vm["tools_status"] = t
		}
		committed, _ := strconv.ParseFloat(esxGet(sum, "committed"), 64)
		uncommitted, _ := strconv.ParseFloat(esxGet(sum, "uncommitted"), 64)
		if committed > 0 || uncommitted > 0 {
			vm["disk_provisioned_gb"] = round1((committed + uncommitted) / (1 << 30))
		}
		if committed > 0 {
			vm["disk_used_gb"] = round1(committed / (1 << 30))
		}
		vms = append(vms, vm)
	}

	datastores := []map[string]any{}
	for _, l := range strings.Split(sshRun(c, "esxcli storage filesystem list"), "\n") {
		if strings.TrimSpace(l) == "" || strings.HasPrefix(l, "---") || strings.HasPrefix(l, "Mount Point") {
			continue
		}
		parts := regexp.MustCompile(`\s{2,}`).Split(strings.TrimSpace(l), -1)
		if len(parts) < 7 {
			continue
		}
		size, _ := strconv.ParseFloat(parts[5], 64)
		free, _ := strconv.ParseFloat(parts[6], 64)
		name := firstNonEmpty(parts[1], parts[0])
		datastores = append(datastores, map[string]any{"name": name, "capacity_gb": round1(size / (1 << 30)), "free_gb": round1(free / (1 << 30)), "type": parts[4]})
	}

	hostInfo := map[string]string{}
	for _, l := range strings.Split(sshRun(c, "esxcli system version get"), "\n") {
		if k, v, ok := strings.Cut(l, ":"); ok {
			hostInfo[strings.ToLower(strings.ReplaceAll(strings.TrimSpace(k), " ", "_"))] = strings.TrimSpace(v)
		}
	}
	p := map[string]any{"type": "vmware", "host_id": id, "datastores": datastores, "vms": vms, "agent_version": "mororo-agent " + Version}
	if v := hostInfo["version"]; v != "" {
		p["esxi_version"] = fmt.Sprintf("%s %s (Build %s)", firstNonEmpty(hostInfo["product"], "ESXi"), v, firstNonEmpty(hostInfo["build"], "?"))
	}
	if m := regexp.MustCompile(`(?i)CPU Cores:\s*(\d+)`).FindStringSubmatch(sshRun(c, "esxcli hardware cpu global get")); m != nil {
		p["cpu_cores"], _ = strconv.Atoi(m[1])
	}
	if m := regexp.MustCompile(`(?i)Physical Memory:\s*(\d+)`).FindStringSubmatch(sshRun(c, "esxcli hardware memory get")); m != nil {
		b, _ := strconv.ParseFloat(m[1], 64)
		p["ram_total_gb"] = round1(b / (1 << 30))
	}
	if up := parseUptime(sshRun(c, "uptime")); up > 0 {
		p["uptime_seconds"] = up
	}
	return p
}

func parseUptime(raw string) int {
	m := regexp.MustCompile(`(?i)up\s+(.+?),\s+\d+ users`).FindStringSubmatch(raw)
	if m == nil {
		m = regexp.MustCompile(`(?i)up\s+(.+)`).FindStringSubmatch(raw)
	}
	if m == nil {
		return 0
	}
	s := 0
	if d := regexp.MustCompile(`(\d+)\s*day`).FindStringSubmatch(m[1]); d != nil {
		n, _ := strconv.Atoi(d[1])
		s += n * 86400
	}
	if h := regexp.MustCompile(`(\d+):(\d+)`).FindStringSubmatch(m[1]); h != nil {
		a, _ := strconv.Atoi(h[1])
		b, _ := strconv.Atoi(h[2])
		s += a*3600 + b*60
	} else if mi := regexp.MustCompile(`(\d+)\s*min`).FindStringSubmatch(m[1]); mi != nil {
		n, _ := strconv.Atoi(mi[1])
		s += n * 60
	}
	return s
}
