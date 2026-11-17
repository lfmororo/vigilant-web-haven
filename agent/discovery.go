package main

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Discovered é um equipamento encontrado na varredura.
type Discovered struct {
	IP         string         `json:"ip"`
	MAC        string         `json:"mac,omitempty"`
	Vendor     string         `json:"vendor,omitempty"`
	Hostname   string         `json:"hostname,omitempty"`
	OpenPorts  []int          `json:"open_ports"`
	DeviceType string         `json:"device_type"`
	Suggest    string         `json:"suggest"` // proxmox | vmware | ilo | idrac | sqlserver | ping | http
	Title      string         `json:"title,omitempty"`
	Pinged     bool           `json:"pinged"`
	Details    map[string]any `json:"details,omitempty"`
}

var scanPorts = []int{22, 23, 80, 443, 445, 554, 902, 1433, 3389, 5000, 5001, 8000, 8006, 8080, 8291, 8443, 8728, 9100, 515, 631, 37777, 34567, 5060, 161}

// scanTargets: a rede informada ou as redes locais (limitadas a /22 para não demorar).
func scanTargets(cidr string) ([]*net.IPNet, error) {
	if cidr != "" {
		var out []*net.IPNet
		for _, c := range strings.Split(cidr, ",") {
			_, n, err := net.ParseCIDR(strings.TrimSpace(c))
			if err != nil {
				return nil, fmt.Errorf("rede inválida %q (ex.: 192.168.0.0/24)", c)
			}
			if ones, _ := n.Mask.Size(); ones < 20 {
				return nil, fmt.Errorf("rede %s grande demais (máximo /20)", c)
			}
			out = append(out, n)
		}
		return out, nil
	}
	ifs, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []*net.IPNet
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		n := strings.ToLower(ifc.Name)
		if strings.HasPrefix(n, "docker") || strings.HasPrefix(n, "veth") || strings.HasPrefix(n, "br-") || strings.Contains(n, "vethernet") || strings.Contains(n, "virtualbox") || strings.Contains(n, "tailscale") || strings.Contains(n, "zerotier") {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil || ipn.IP.IsLinkLocalUnicast() || !ipn.IP.IsPrivate() {
				continue
			}
			ones, _ := ipn.Mask.Size()
			if ones < 22 {
				ones = 24 // rede muito grande: varre só a /24 da máquina
			}
			mask := net.CIDRMask(ones, 32)
			nn := &net.IPNet{IP: ipn.IP.To4().Mask(mask), Mask: mask}
			if !seen[nn.String()] {
				seen[nn.String()] = true
				out = append(out, nn)
			}
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("nenhuma rede local IPv4 privada encontrada")
	}
	return out, nil
}

func hostsOf(n *net.IPNet) []net.IP {
	base := binary.BigEndian.Uint32(n.IP.To4())
	ones, bits := n.Mask.Size()
	size := uint32(1) << uint(bits-ones)
	var out []net.IP
	for i := uint32(1); i < size-1; i++ {
		ip := make(net.IP, 4)
		binary.BigEndian.PutUint32(ip, base+i)
		out = append(out, ip)
	}
	return out
}

// scanNetwork faz ping + teste de portas comuns, identifica o tipo e devolve os encontrados.
func scanNetwork(nets []*net.IPNet, progress func(done, total int)) []Discovered {
	var ips []net.IP
	for _, n := range nets {
		ips = append(ips, hostsOf(n)...)
	}
	self := map[string]bool{}
	for _, ip := range localIPs() {
		self[ip] = true
	}
	var mu sync.Mutex
	var found []Discovered
	var done int64
	sem := make(chan struct{}, 64)
	var wg sync.WaitGroup
	for _, ip := range ips {
		wg.Add(1)
		go func(ip net.IP) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			defer func() {
				d := atomic.AddInt64(&done, 1)
				if progress != nil {
					progress(int(d), len(ips))
				}
			}()
			d := probeHost(ip)
			if d == nil {
				return
			}
			if self[d.IP] {
				d.Details = map[string]any{"esta_maquina": true}
			}
			mu.Lock()
			found = append(found, *d)
			mu.Unlock()
		}(ip)
	}
	wg.Wait()

	arp := arpTable()
	var wg2 sync.WaitGroup
	for i := range found {
		if m, ok := arp[found[i].IP]; ok {
			found[i].MAC = m
			found[i].Vendor = macVendor(m)
		}
		wg2.Add(1)
		go func(d *Discovered) {
			defer wg2.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if names, err := net.DefaultResolver.LookupAddr(ctx, d.IP); err == nil && len(names) > 0 {
				d.Hostname = strings.TrimSuffix(names[0], ".")
			}
			fingerprint(d)
		}(&found[i])
	}
	wg2.Wait()
	sort.Slice(found, func(i, j int) bool {
		return binary.BigEndian.Uint32(net.ParseIP(found[i].IP).To4()) < binary.BigEndian.Uint32(net.ParseIP(found[j].IP).To4())
	})
	return found
}

func probeHost(ip net.IP) *Discovered {
	var open []int
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, p := range scanPorts {
		if p == 161 || p == 5060 {
			continue // UDP: não testado por conexão
		}
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			c, err := net.DialTimeout("tcp", net.JoinHostPort(ip.String(), strconv.Itoa(p)), 700*time.Millisecond)
			if err == nil {
				c.Close()
				mu.Lock()
				open = append(open, p)
				mu.Unlock()
			}
		}(p)
	}
	pinged := pingOnce(ip, 800*time.Millisecond)
	wg.Wait()
	if !pinged && len(open) == 0 {
		return nil
	}
	sort.Ints(open)
	if open == nil {
		open = []int{}
	}
	return &Discovered{IP: ip.String(), OpenPorts: open, Pinged: pinged}
}

func hasPort(d *Discovered, ports ...int) bool {
	for _, p := range ports {
		for _, o := range d.OpenPorts {
			if o == p {
				return true
			}
		}
	}
	return false
}

var reTitle = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

func httpPeek(url string) (status int, title string, body string, header http.Header) {
	cl := &http.Client{
		Timeout:   4 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, DisableKeepAlives: true},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
	resp, err := cl.Get(url)
	if err != nil {
		return 0, "", "", nil
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if m := reTitle.FindSubmatch(b); m != nil {
		title = strings.Join(strings.Fields(string(m[1])), " ")
	}
	return resp.StatusCode, title, string(b), resp.Header
}

// fingerprint define o tipo provável e o que sugerir monitorar.
func fingerprint(d *Discovered) {
	d.DeviceType, d.Suggest = "other", "ping"
	v := strings.ToLower(d.Vendor)
	set := func(t, s string) { d.DeviceType, d.Suggest = t, s }

	switch {
	case hasPort(d, 8006):
		set("proxmox", "proxmox")
		return
	case hasPort(d, 1433):
		set("sqlserver", "sqlserver")
	case hasPort(d, 3389) || hasPort(d, 445):
		set("windows", "ping")
	case hasPort(d, 9100, 515, 631):
		set("printer", "ping")
	case hasPort(d, 8291, 8728) || strings.Contains(v, "mikrotik"):
		set("router", "ping")
	case hasPort(d, 37777, 34567) || strings.Contains(v, "hikvision") || strings.Contains(v, "dahua") || strings.Contains(v, "intelbras"):
		set("dvr", "ping")
	case hasPort(d, 554):
		set("camera", "ping")
	case strings.Contains(v, "ubiquiti"):
		set("access_point", "ping")
	case strings.Contains(v, "grandstream"):
		set("phone", "ping")
	case hasPort(d, 22) && !hasPort(d, 80, 443):
		set("linux", "ping")
	}

	if hasPort(d, 443) {
		// Redfish responde a raiz sem autenticação: identifica iLO e iDRAC.
		if st, _, body, _ := httpPeek("https://" + d.IP + "/redfish/v1/"); st == 200 && strings.Contains(body, "RedfishVersion") {
			low := strings.ToLower(body)
			switch {
			case strings.Contains(low, "\"hpe\"") || strings.Contains(low, "\"hp\"") || strings.Contains(low, "hewlett"):
				set("ilo", "ilo")
			case strings.Contains(low, "dell"):
				set("idrac", "idrac")
			default:
				set("bmc", "ping")
			}
			d.Title = "Redfish"
			return
		}
		_, title, body, _ := httpPeek("https://" + d.IP + "/")
		d.Title = title
		lt := strings.ToLower(title + " " + body)
		switch {
		case strings.Contains(lt, "vmware esxi") || (hasPort(d, 902) && strings.Contains(lt, "vmware")):
			set("vmware", "vmware")
			return
		case strings.Contains(lt, "integrated lights-out") || strings.Contains(lt, "ilo "):
			set("ilo", "ilo")
			return
		case strings.Contains(lt, "idrac"):
			set("idrac", "idrac")
			return
		case strings.Contains(lt, "synology") || strings.Contains(lt, "qnap") || strings.Contains(lt, "truenas"):
			set("nas", "ping")
		case strings.Contains(lt, "sophos"):
			set("firewall", "ping")
		case strings.Contains(lt, "unifi"):
			set("access_point", "ping")
		}
	}
	if d.Title == "" && hasPort(d, 80, 8080) {
		port := "80"
		if !hasPort(d, 80) {
			port = "8080"
		}
		_, title, body, hdr := httpPeek("http://" + d.IP + ":" + port + "/")
		d.Title = title
		lt := strings.ToLower(title + " " + body + " " + hdr.Get("Server"))
		switch {
		case d.DeviceType != "other":
		case strings.Contains(lt, "printer") || strings.Contains(lt, "impressora") || strings.Contains(lt, "epson") || strings.Contains(lt, "brother") || strings.Contains(lt, "laserjet") || strings.Contains(lt, "ricoh") || strings.Contains(lt, "kyocera") || strings.Contains(lt, "samsung"):
			set("printer", "ping")
		case strings.Contains(lt, "routeros") || strings.Contains(lt, "mikrotik"):
			set("router", "ping")
		case strings.Contains(lt, "intelbras") || strings.Contains(lt, "hikvision") || strings.Contains(lt, "dvr") || strings.Contains(lt, "nvr"):
			set("dvr", "ping")
		case strings.Contains(lt, "tp-link") || strings.Contains(lt, "router") || strings.Contains(lt, "roteador"):
			set("router", "ping")
		case strings.Contains(lt, "switch"):
			set("switch", "ping")
		case strings.Contains(lt, "grandstream"):
			set("phone", "ping")
		}
	}
}

// ---------------------------------------------------------------- ARP e fabricante

var reArpWin = regexp.MustCompile(`^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})\s+`)

func arpTable() map[string]string {
	out := map[string]string{}
	if runtime.GOOS == "windows" {
		b, _ := hiddenCmd("arp", "-a").Output()
		for _, l := range strings.Split(string(b), "\n") {
			if m := reArpWin.FindStringSubmatch(l); m != nil {
				mac := strings.ToUpper(strings.ReplaceAll(m[2], "-", ":"))
				if mac != "FF:FF:FF:FF:FF:FF" {
					out[m[1]] = mac
				}
			}
		}
		return out
	}
	b, err := os.ReadFile("/proc/net/arp")
	if err != nil {
		return out
	}
	for i, l := range strings.Split(string(b), "\n") {
		f := strings.Fields(l)
		if i == 0 || len(f) < 4 || f[3] == "00:00:00:00:00:00" {
			continue
		}
		out[f[0]] = strings.ToUpper(f[3])
	}
	return out
}

// Prefixos de fabricante mais comuns em redes de clientes (lista curta, só como dica).
var ouiVendors = map[string]string{
	"4C:5E:0C": "MikroTik", "64:D1:54": "MikroTik", "D4:CA:6D": "MikroTik", "B8:69:F4": "MikroTik", "CC:2D:E0": "MikroTik",
	"48:8F:5A": "MikroTik", "2C:C8:1B": "MikroTik", "DC:2C:6E": "MikroTik", "08:55:31": "MikroTik", "18:FD:74": "MikroTik",
	"6C:3B:6B": "MikroTik", "74:4D:28": "MikroTik", "E4:8D:8C": "MikroTik", "C4:AD:34": "MikroTik",
	"24:A4:3C": "Ubiquiti", "44:D9:E7": "Ubiquiti", "80:2A:A8": "Ubiquiti", "F0:9F:C2": "Ubiquiti", "FC:EC:DA": "Ubiquiti",
	"78:8A:20": "Ubiquiti", "B4:FB:E4": "Ubiquiti", "18:E8:29": "Ubiquiti", "74:83:C2": "Ubiquiti", "E0:63:DA": "Ubiquiti",
	"68:72:51": "Ubiquiti", "DC:9F:DB": "Ubiquiti",
	"44:19:B6": "Hikvision", "BC:AD:28": "Hikvision", "C0:56:E3": "Hikvision", "4C:BD:8F": "Hikvision", "54:C4:15": "Hikvision",
	"28:57:BE": "Hikvision", "A4:14:37": "Hikvision", "C4:2F:90": "Hikvision",
	"3C:EF:8C": "Dahua", "90:02:A9": "Dahua", "BC:32:5F": "Dahua", "E0:50:8B": "Dahua", "4C:11:BF": "Dahua", "14:A7:8B": "Dahua",
	"00:0B:82": "Grandstream", "C0:74:AD": "Grandstream",
	"B8:27:EB": "Raspberry Pi", "DC:A6:32": "Raspberry Pi", "E4:5F:01": "Raspberry Pi",
	"00:50:56": "VMware (VM)", "00:0C:29": "VMware (VM)", "BC:24:11": "Proxmox (VM)", "52:54:00": "QEMU/KVM (VM)", "00:15:5D": "Hyper-V (VM)",
	"50:C7:BF": "TP-Link", "98:DA:C4": "TP-Link", "C0:4A:00": "TP-Link", "F4:F2:6D": "TP-Link", "60:32:B1": "TP-Link",
	"14:CC:20": "TP-Link", "AC:84:C6": "TP-Link",
	"00:11:32": "Synology", "00:08:9B": "QNAP", "24:5E:BE": "QNAP",
}

func macVendor(mac string) string {
	if len(mac) < 8 {
		return ""
	}
	return ouiVendors[strings.ToUpper(mac[:8])]
}
