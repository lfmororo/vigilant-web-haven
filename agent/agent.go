package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

type agent struct {
	c      *Config
	api    *API
	dryRun bool

	lastConfig    time.Time
	lastMetrics   time.Time
	lastDevices   time.Time
	devicesBusy   atomic.Bool
	probeLast     map[string]time.Time
	probeMu       sync.Mutex
	pendingProbes []ProbeResult
}

func newAgent(c *Config) *agent {
	return &agent{c: c, api: newAPI(c.URL, c.Token), probeLast: map[string]time.Time{}}
}

// services: lista do painel (se houver) ou a escolhida na instalação.
func (c *Config) services() []string {
	if c.Remote != nil && len(c.Remote.Services) > 0 {
		return c.Remote.Services
	}
	return c.Services
}

func (c *Config) role() string {
	if c.Remote != nil && c.Remote.Role != "" {
		return c.Remote.Role
	}
	if c.Role == "server" {
		return "server"
	}
	return "workstation"
}

func osFamily() string {
	if runtime.GOOS == "windows" {
		return "windows"
	}
	return "linux"
}

// enroll cadastra a máquina no painel (idempotente).
func (a *agent) enroll() error {
	h, _ := os.Hostname()
	if a.c.MachineID == "" {
		a.c.MachineID = machineID()
	}
	m := collectMetricsLight()
	body := map[string]any{
		"machine_id": a.c.MachineID, "hostname": h, "name": a.c.Name, "role": a.c.role(),
		"os_family": osFamily(), "os_name": m.OSName, "os_version": m.OSVersion, "arch": runtime.GOARCH,
		"agent_version": Version,
	}
	if len(a.c.Services) > 0 {
		body["settings"] = map[string]any{"services": a.c.Services}
	}
	var r enrollResp
	if err := a.api.Agent("enroll", body, &r); err != nil {
		return err
	}
	a.c.EndpointID = r.EndpointID
	if r.Config != nil {
		a.c.Remote = r.Config
		a.c.ClientName = r.Config.ClientName
	}
	a.lastConfig = time.Now()
	return saveConfig(a.c)
}

func (a *agent) refreshConfig() error {
	var r configResp
	err := a.api.Agent("config", map[string]any{"endpoint_id": a.c.EndpointID}, &r)
	var ae *apiError
	if errors.As(err, &ae) && ae.Status == 404 {
		log.Printf("endpoint removido no painel — recadastrando")
		return a.enroll()
	}
	if err != nil {
		return err
	}
	if r.Config != nil {
		a.c.Remote = r.Config
		a.c.ClientName = r.Config.ClientName
		_ = saveConfig(a.c)
	}
	a.lastConfig = time.Now()
	return nil
}

func (a *agent) metricsInterval() time.Duration {
	if a.c.Remote != nil && a.c.Remote.MetricsInterval >= 60 {
		return time.Duration(a.c.Remote.MetricsInterval) * time.Second
	}
	if a.c.role() == "server" {
		return 5 * time.Minute
	}
	return 15 * time.Minute
}

func (a *agent) devicesInterval() time.Duration {
	if a.c.Remote != nil && a.c.Remote.DevicesInterval >= 60 {
		return time.Duration(a.c.Remote.DevicesInterval) * time.Second
	}
	return 5 * time.Minute
}

func (a *agent) inventoryDue() bool {
	h := 12
	if a.c.Remote != nil && a.c.Remote.InventoryHours > 0 {
		h = a.c.Remote.InventoryHours
	}
	return time.Since(a.c.LastInventoryAt) >= time.Duration(h)*time.Hour
}

// reportMetrics coleta a máquina e envia para o painel (endpoint + servidor).
func (a *agent) reportMetrics(forceInventory bool) error {
	m := collectMetrics(a.c)
	body := map[string]any{
		"endpoint_id": a.c.EndpointID, "agent_version": Version, "metrics": endpointMetrics(m),
		"probes": a.takeProbeResults(),
	}
	withInv := forceInventory || a.inventoryDue()
	if withInv {
		body["inventory"] = collectInventory(m)
	}
	writeDesktopState(a.c, m)

	if a.dryRun {
		dump("endpoint-agent report", body)
	} else {
		var r reportResp
		if err := a.api.Agent("report", body, &r); err != nil {
			return fmt.Errorf("report: %w", err)
		}
		if r.Outdated {
			log.Printf("nova versão disponível no painel: %s (instalada %s)", r.LatestVersion, Version)
		}
		if withInv {
			a.c.LastInventoryAt = time.Now()
			_ = saveConfig(a.c)
		}
	}

	// Servidores: alimenta windows_servers/linux_servers com os alertas completos.
	if a.c.role() == "server" && a.c.Remote != nil {
		var p map[string]any
		if runtime.GOOS == "windows" && a.c.Remote.WindowsServerID != "" {
			p = windowsIngest(a.c.Remote.WindowsServerID, m)
		} else if runtime.GOOS != "windows" && a.c.Remote.LinuxServerID != "" {
			p = linuxIngest(a.c.Remote.LinuxServerID, m)
		}
		if p != nil {
			if a.dryRun {
				dump("server-monitor-ingest", p)
			} else if err := a.api.Ingest(p); err != nil {
				return fmt.Errorf("ingest do servidor: %w", err)
			}
		}
	}
	a.lastMetrics = time.Now()
	return nil
}

func dump(title string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	s := string(b)
	if len(s) > 20000 {
		s = s[:20000] + "\n… (cortado)"
	}
	fmt.Printf("===== %s =====\n%s\n", title, s)
}

func (a *agent) takeProbeResults() []ProbeResult {
	a.probeMu.Lock()
	defer a.probeMu.Unlock()
	r := a.pendingProbes
	a.pendingProbes = nil
	if r == nil {
		r = []ProbeResult{}
	}
	return r
}

// runDueProbes executa as checagens vencidas e envia o resultado num report leve.
func (a *agent) runDueProbes(sendNow bool) {
	if a.c.Remote == nil || len(a.c.Remote.Probes) == 0 {
		return
	}
	var due []Probe
	now := time.Now()
	for _, p := range a.c.Remote.Probes {
		iv := time.Duration(max(30, p.Interval)) * time.Second
		if now.Sub(a.probeLast[p.ID]) >= iv-5*time.Second {
			due = append(due, p)
			a.probeLast[p.ID] = now
		}
	}
	if len(due) == 0 {
		return
	}
	results := runProbes(due, false) // sites: sempre valida o certificado (é o que o cliente final vê)
	if a.dryRun {
		dump("checagens", results)
		return
	}
	a.probeMu.Lock()
	a.pendingProbes = append(a.pendingProbes, results...)
	a.probeMu.Unlock()
	if sendNow {
		body := map[string]any{"endpoint_id": a.c.EndpointID, "agent_version": Version, "probes": a.takeProbeResults()}
		if err := a.api.Agent("report", body, nil); err != nil {
			log.Printf("envio das checagens falhou: %v", err)
		}
	}
}

func (a *agent) runDevices(wait bool) {
	if a.c.Remote == nil || !anyTrue(a.c.Remote.Collect) {
		return
	}
	if !a.devicesBusy.CompareAndSwap(false, true) {
		return
	}
	a.lastDevices = time.Now()
	job := func() {
		defer a.devicesBusy.Store(false)
		collectDevices(a)
	}
	if wait {
		job()
	} else {
		go job()
	}
}

func anyTrue(m map[string]bool) bool {
	for _, v := range m {
		if v {
			return true
		}
	}
	return false
}

// cycle: uma rodada completa (comando once).
func (a *agent) cycle(forceInventory bool) error {
	if !a.dryRun {
		if a.c.EndpointID == "" {
			if err := a.enroll(); err != nil {
				return fmt.Errorf("cadastro: %w", err)
			}
		} else if err := a.refreshConfig(); err != nil {
			return fmt.Errorf("configuração: %w", err)
		}
	}
	a.runDueProbes(false)
	if err := a.reportMetrics(forceInventory); err != nil {
		return err
	}
	a.runDevices(true)
	log.Printf("coleta concluída")
	return nil
}

// loop principal do serviço.
func (a *agent) loop(stop <-chan struct{}) {
	log.Printf("mororo-agent %s iniciado (%s, %s)", Version, a.c.role(), a.c.URL)
	for a.c.EndpointID == "" {
		if err := a.enroll(); err != nil {
			log.Printf("cadastro falhou: %v — nova tentativa em 1 min", err)
			select {
			case <-stop:
				return
			case <-time.After(time.Minute):
			}
			continue
		}
	}
	_ = a.refreshConfig()

	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	first := true
	for {
		if time.Since(a.lastConfig) >= 10*time.Minute {
			if err := a.refreshConfig(); err != nil {
				log.Printf("configuração: %v", err)
				a.lastConfig = time.Now().Add(-8 * time.Minute) // tenta de novo em ~2 min
			}
		}
		metricsDue := first || time.Since(a.lastMetrics) >= a.metricsInterval()
		a.runDueProbes(!metricsDue)
		if metricsDue {
			if err := a.reportMetrics(false); err != nil {
				log.Printf("%v", err)
				a.lastMetrics = time.Now().Add(-a.metricsInterval() + time.Minute)
			}
		}
		if first || time.Since(a.lastDevices) >= a.devicesInterval() {
			a.runDevices(false)
		}
		first = false
		select {
		case <-stop:
			log.Printf("mororo-agent parando")
			return
		case <-tick.C:
		}
	}
}

// collectMetricsLight: só identificação do SO (usado no cadastro).
func collectMetricsLight() *HostMetrics {
	m := &HostMetrics{}
	m.OSName, m.OSVersion = osIdentity()
	return m
}

// desktop.json: o componente da sessão do usuário lê este arquivo para desenhar o papel de parede.
type DesktopState struct {
	Hostname   string          `json:"hostname"`
	IPs        []string        `json:"ips"`
	OS         string          `json:"os"`
	RemoteID   string          `json:"remote_id"`
	ClientName string          `json:"client_name"`
	Settings   DesktopSettings `json:"settings"`
	Enabled    bool            `json:"enabled"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

func desktopStatePath() string { return filepath.Join(dataDir(), "desktop.json") }

func writeDesktopState(c *Config, m *HostMetrics) {
	if runtime.GOOS != "windows" {
		return
	}
	s := DesktopState{Hostname: m.Hostname, IPs: m.IPs, OS: m.OSName, RemoteID: m.RemoteID, ClientName: c.ClientName,
		Enabled: c.DesktopInfo, UpdatedAt: time.Now()}
	if c.Remote != nil {
		s.Settings = c.Remote.Desktop
		s.Enabled = c.DesktopInfo && c.Remote.Desktop.Enabled
	} else {
		s.Settings = DesktopSettings{Enabled: true, Company: "Mororo.Tech", Message: "Suporte de TI"}
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	_ = os.MkdirAll(dataDir(), 0o755)
	_ = os.WriteFile(desktopStatePath(), b, 0o644)
}
