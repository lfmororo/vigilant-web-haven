package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

type Probe struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Kind           string `json:"kind"` // ping | tcp | http
	Target         string `json:"target"`
	Port           int    `json:"port"`
	ExpectedStatus int    `json:"expected_status"`
	Keyword        string `json:"keyword"`
	Interval       int    `json:"interval_seconds"`
}

type ProbeResult struct {
	ID            string   `json:"id"`
	Status        string   `json:"status"` // up | down
	Degraded      bool     `json:"degraded,omitempty"`
	LatencyMs     *float64 `json:"latency_ms,omitempty"`
	PacketLossPct *float64 `json:"packet_loss_pct,omitempty"`
	HTTPStatus    int      `json:"http_status,omitempty"`
	SSLExpiresAt  string   `json:"ssl_expires_at,omitempty"`
	Error         string   `json:"error,omitempty"`
}

func runProbes(list []Probe, insecure bool) []ProbeResult {
	out := make([]ProbeResult, len(list))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 16)
	for i, p := range list {
		wg.Add(1)
		go func(i int, p Probe) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			out[i] = runProbe(p, insecure)
		}(i, p)
	}
	wg.Wait()
	return out
}

func runProbe(p Probe, insecure bool) ProbeResult {
	r := ProbeResult{ID: p.ID}
	switch p.Kind {
	case "ping":
		lat, loss, err := pingHost(p.Target, 3, time.Second)
		r.PacketLossPct = &loss
		if err != nil || loss >= 100 {
			r.Status = "down"
			if err != nil {
				r.Error = err.Error()
			} else {
				r.Error = "100% de perda de pacotes"
			}
			return r
		}
		r.Status, r.LatencyMs = "up", &lat
		if loss > 0 {
			r.Degraded, r.Error = true, fmt.Sprintf("%.0f%% de perda de pacotes", loss)
		}
	case "tcp":
		lat, err := tcpCheck(p.Target, p.Port, 5*time.Second)
		if err != nil {
			r.Status, r.Error = "down", err.Error()
			return r
		}
		r.Status, r.LatencyMs = "up", &lat
	case "http":
		return httpCheck(p, insecure)
	default:
		r.Status, r.Error = "down", "tipo de checagem desconhecido: "+p.Kind
	}
	return r
}

func tcpCheck(host string, port int, timeout time.Duration) (float64, error) {
	start := time.Now()
	c, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), timeout)
	if err != nil {
		return 0, simplifyNetErr(err)
	}
	c.Close()
	return round1(float64(time.Since(start).Microseconds()) / 1000), nil
}

func simplifyNetErr(err error) error {
	s := err.Error()
	switch {
	case strings.Contains(s, "refused"), strings.Contains(s, "actively refused"):
		return fmt.Errorf("conexão recusada")
	case strings.Contains(s, "timeout"), strings.Contains(s, "i/o timeout"):
		return fmt.Errorf("tempo esgotado")
	case strings.Contains(s, "no such host"):
		return fmt.Errorf("nome não encontrado (DNS)")
	case strings.Contains(s, "unreachable"):
		return fmt.Errorf("rede inalcançável")
	}
	return err
}

func httpCheck(p Probe, insecure bool) ProbeResult {
	r := ProbeResult{ID: p.ID}
	url := p.Target
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		url = "https://" + url
	}
	tr := &http.Transport{
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: insecure},
		TLSHandshakeTimeout: 10 * time.Second,
		DisableKeepAlives:   true,
		Proxy:               http.ProxyFromEnvironment,
	}
	cl := &http.Client{Timeout: 20 * time.Second, Transport: tr}
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "mororo-agent/"+Version+" (monitoramento)")
	start := time.Now()
	resp, err := cl.Do(req)
	if err != nil {
		r.Status, r.Error = "down", simplifyHTTPErr(err)
		return r
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512<<10))
	lat := round1(float64(time.Since(start).Microseconds()) / 1000)
	r.LatencyMs, r.HTTPStatus = &lat, resp.StatusCode
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		r.SSLExpiresAt = resp.TLS.PeerCertificates[0].NotAfter.UTC().Format(time.RFC3339)
	}
	ok := resp.StatusCode < 400
	if p.ExpectedStatus > 0 {
		ok = resp.StatusCode == p.ExpectedStatus
	}
	if !ok {
		r.Status, r.Error = "down", fmt.Sprintf("HTTP %d", resp.StatusCode)
		return r
	}
	r.Status = "up"
	if p.Keyword != "" && !strings.Contains(strings.ToLower(string(body)), strings.ToLower(p.Keyword)) {
		r.Degraded, r.Error = true, fmt.Sprintf("texto \"%s\" não encontrado na página", p.Keyword)
	}
	return r
}

func simplifyHTTPErr(err error) string {
	s := err.Error()
	if strings.Contains(s, "x509") || strings.Contains(s, "certificate") {
		return "certificado SSL inválido: " + s[strings.LastIndex(s, ":")+1:]
	}
	if e := simplifyNetErr(err); e != err {
		return e.Error()
	}
	return s
}

// ---------------------------------------------------------------- ping

// pingHost tenta ICMP direto (o serviço roda como SYSTEM/root) e cai para o comando ping.
func pingHost(host string, count int, timeout time.Duration) (avgMs float64, lossPct float64, err error) {
	ip, err := resolveIPv4(host)
	if err != nil {
		return 0, 100, err
	}
	if avg, loss, err := osPing(ip, count, timeout); err == nil {
		return avg, loss, nil
	}
	return cmdPing(ip.String(), count, timeout)
}

func resolveIPv4(host string) (net.IP, error) {
	if ip := net.ParseIP(host); ip != nil && ip.To4() != nil {
		return ip.To4(), nil
	}
	addrs, err := net.LookupIP(host)
	if err != nil {
		return nil, fmt.Errorf("nome não encontrado (DNS)")
	}
	for _, a := range addrs {
		if a.To4() != nil {
			return a.To4(), nil
		}
	}
	return nil, fmt.Errorf("sem endereço IPv4")
}

// pingOnce: um eco ICMP (usado na varredura).
func pingOnce(ip net.IP, timeout time.Duration) bool {
	_, loss, err := osPing(ip, 1, timeout)
	return err == nil && loss < 100
}

var icmpSeq uint32
var icmpMu sync.Mutex

func icmpPing(ip net.IP, count int, timeout time.Duration) (float64, float64, error) {
	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return 0, 0, err
	}
	defer conn.Close()
	id := (os.Getpid() + int(time.Now().UnixNano()%1000)) & 0xffff
	var total time.Duration
	recv := 0
	buf := make([]byte, 1500)
	for i := 0; i < count; i++ {
		icmpMu.Lock()
		icmpSeq++
		seq := int(icmpSeq & 0xffff)
		icmpMu.Unlock()
		msg := icmp.Message{Type: ipv4.ICMPTypeEcho, Code: 0, Body: &icmp.Echo{ID: id, Seq: seq, Data: []byte("mororo-agent")}}
		wb, _ := msg.Marshal(nil)
		start := time.Now()
		if _, err := conn.WriteTo(wb, &net.IPAddr{IP: ip}); err != nil {
			return 0, 0, err
		}
		deadline := start.Add(timeout)
		for {
			_ = conn.SetReadDeadline(deadline)
			n, peer, err := conn.ReadFrom(buf)
			if err != nil {
				break // timeout deste pacote
			}
			pa, ok := peer.(*net.IPAddr)
			if !ok || !pa.IP.Equal(ip) {
				continue
			}
			rm, err := icmp.ParseMessage(1, buf[:n])
			if err != nil || rm.Type != ipv4.ICMPTypeEchoReply {
				continue
			}
			if e, ok := rm.Body.(*icmp.Echo); ok && e.ID == id && e.Seq == seq {
				total += time.Since(start)
				recv++
				break
			}
		}
	}
	loss := round1(float64(count-recv) / float64(count) * 100)
	if recv == 0 {
		return 0, 100, nil
	}
	return round1(float64(total.Microseconds()) / 1000 / float64(recv)), loss, nil
}

// cmdPing usa o ping do sistema; conta as respostas por "TTL=" (independe do idioma).
func cmdPing(ip string, count int, timeout time.Duration) (float64, float64, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = hiddenCmd("ping", "-n", strconv.Itoa(count), "-w", strconv.Itoa(int(timeout.Milliseconds())), ip)
	} else {
		cmd = exec.Command("ping", "-c", strconv.Itoa(count), "-W", strconv.Itoa(max(1, int(timeout.Seconds()))), ip)
	}
	start := time.Now()
	out, _ := cmd.CombinedOutput()
	el := time.Since(start)
	recv := strings.Count(strings.ToLower(string(out)), "ttl=")
	if recv == 0 {
		return 0, 100, nil
	}
	if recv > count {
		recv = count
	}
	loss := round1(float64(count-recv) / float64(count) * 100)
	// Latência média aproximada a partir de "time=12ms"/"tempo=12ms".
	var sum float64
	var n int
	for _, f := range strings.Fields(strings.ToLower(string(out))) {
		for _, pre := range []string{"time=", "tempo=", "time<", "tempo<"} {
			if v, ok := strings.CutPrefix(f, pre); ok {
				v = strings.TrimSuffix(strings.TrimSuffix(v, "ms"), " ")
				if x, err := strconv.ParseFloat(strings.ReplaceAll(v, ",", "."), 64); err == nil {
					sum += x
					n++
				}
			}
		}
	}
	if n > 0 {
		return round1(sum / float64(n)), loss, nil
	}
	return round1(float64(el.Milliseconds()) / float64(count)), loss, nil
}
