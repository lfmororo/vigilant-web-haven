// mororo-agent — agente unificado da Mororo.Tech para o vigilant-web-haven.
//
// Um único executável para servidores e estações (Windows e Linux):
//   - métricas, serviços, eventos e inventário de hardware/software da máquina;
//   - coleta de equipamentos da rede (Proxmox, VMware ESXi, iLO/iDRAC, SQL Server);
//   - checagens de ping, porta e HTTP/SSL;
//   - informações de suporte no papel de parede (Windows);
//   - assistente de instalação com varredura de rede.
//
// Comandos:
//
//	mororo-agent                  sem argumentos: abre o assistente (ou roda como serviço)
//	mororo-agent install [flags]  assistente; com --token e --quiet instala sem perguntas
//	mororo-agent run              executa em primeiro plano (o serviço usa este modo)
//	mororo-agent once             uma coleta completa, mostrando o que seria enviado
//	mororo-agent scan             varre a rede e lista os equipamentos encontrados
//	mororo-agent status           mostra a configuração e o estado do serviço
//	mororo-agent uninstall        remove o serviço e a configuração
//	mororo-agent desktop          atualiza o papel de parede (sessão do usuário)
//	mororo-agent version
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Preenchidos no build (-ldflags "-X main.Version=... -X main.DefaultURL=...").
var (
	Version    = "1.0.0"
	DefaultURL = "https://egbusmegupjfxqswdlxq.supabase.co"
)

const (
	ServiceName        = "MororoAgent"
	ServiceDisplayName = "Mororo.Tech Agent"
	ServiceDescription = "Monitoramento, inventário e suporte remoto da Mororo.Tech (vigilant-web-haven)."
)

// Config é gravada em ProgramData (Windows) ou /etc (Linux), legível só por administradores.
type Config struct {
	URL             string          `json:"url"`
	Token           string          `json:"token"`
	MachineID       string          `json:"machine_id"`
	EndpointID      string          `json:"endpoint_id"`
	Role            string          `json:"role"` // server | workstation
	Name            string          `json:"name,omitempty"`
	ClientName      string          `json:"client_name,omitempty"`
	Services        []string        `json:"services,omitempty"`
	InsecureTLS     bool            `json:"insecure_tls"` // certificados autoassinados de iLO/Proxmox
	DesktopInfo     bool            `json:"desktop_info"`
	Remote          *RemoteConfig   `json:"remote,omitempty"` // última configuração recebida do painel
	LastInventoryAt time.Time       `json:"last_inventory_at,omitempty"`
	Extra           json.RawMessage `json:"extra,omitempty"`
}

// RemoteConfig é a configuração devolvida por endpoint-agent (action=config).
type RemoteConfig struct {
	EndpointID       string          `json:"endpoint_id"`
	Name             string          `json:"name"`
	Role             string          `json:"role"`
	ClientName       string          `json:"client_name"`
	WindowsServerID  string          `json:"windows_server_id"`
	LinuxServerID    string          `json:"linux_server_id"`
	MetricsInterval  int             `json:"metrics_interval_seconds"`
	InventoryHours   int             `json:"inventory_interval_hours"`
	DevicesInterval  int             `json:"devices_interval_seconds"`
	Services         []string        `json:"services"`
	Desktop          DesktopSettings `json:"desktop"`
	Probes           []Probe         `json:"probes"`
	Collect          map[string]bool `json:"collect"`
	LatestVersion    string          `json:"latest_version"`
}

type DesktopSettings struct {
	Enabled  bool   `json:"enabled"`
	Company  string `json:"company"`
	Phone    string `json:"phone"`
	Message  string `json:"message"`
	Position string `json:"position"`
	Client   string `json:"client"`
}

var (
	cfgMu   sync.Mutex
	aclOnce sync.Once
)

func dataDir() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "MororoAgent")
	}
	return "/etc/mororo-agent"
}

func stateDir() string {
	if runtime.GOOS == "windows" {
		return dataDir()
	}
	return "/var/lib/mororo-agent"
}

func configPath() string { return filepath.Join(dataDir(), "config.json") }

func loadConfig() (*Config, error) {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	b, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("config inválida: %w", err)
	}
	if c.URL == "" {
		c.URL = DefaultURL
	}
	return &c, nil
}

func saveConfig(c *Config) error {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		return err
	}
	aclOnce.Do(func() { restrictDirACL(dataDir()) })
	b, _ := json.MarshalIndent(c, "", "  ")
	tmp := configPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, configPath()); err != nil {
		return err
	}
	restrictConfigACL(configPath())
	return nil
}

// machineID estável: ID do sistema operacional + hostname (hash).
func machineID() string {
	raw := osMachineID()
	if raw == "" {
		h, _ := os.Hostname()
		raw = "host:" + strings.ToLower(h)
	}
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:16])
}

func setupLog(toFile bool) {
	log.SetFlags(log.LstdFlags)
	if !toFile {
		return
	}
	dir := filepath.Join(stateDir(), "logs")
	_ = os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, "agent.log")
	if st, err := os.Stat(path); err == nil && st.Size() > 5<<20 {
		_ = os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err == nil {
		log.SetOutput(f)
	}
}

func main() {
	if len(os.Args) < 2 {
		if isWindowsService() {
			runService()
			return
		}
		// Duplo clique no .exe: abre o assistente.
		cmdInstall(nil)
		return
	}
	cmd, args := os.Args[1], os.Args[2:]
	if cmd != "run" && cmd != "service" && cmd != "desktop" {
		attachParentConsole()
	}
	switch cmd {
	case "install", "setup", "instalar":
		cmdInstall(args)
	case "run", "service":
		runService()
	case "once":
		cmdOnce(args)
	case "scan":
		cmdScan(args)
	case "status":
		cmdStatus()
	case "uninstall", "desinstalar":
		cmdUninstall(args)
	case "desktop":
		cmdDesktop(args)
	case "version", "--version", "-v":
		fmt.Printf("mororo-agent %s (%s/%s)\n", Version, runtime.GOOS, runtime.GOARCH)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "comando desconhecido: %s\n\n", cmd)
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Print(`mororo-agent ` + Version + ` — Mororo.Tech

  install                      abre o assistente de instalação (navegador)
  install --token T --role server|workstation [--name N] [--url URL] [--services a,b] [--no-desktop] --quiet
                               instalação silenciosa (GPO, script, RMM)
  run                          executa em primeiro plano
  once                         uma coleta completa (teste)
  scan [--cidr 192.168.0.0/24] varre a rede
  status                       mostra a configuração
  uninstall                    remove o agente
  desktop                      atualiza o papel de parede com as informações de suporte
  version
`)
}

func cmdStatus() {
	c, err := loadConfig()
	if err != nil {
		fmt.Println("Agente não configurado:", err)
		return
	}
	fmt.Printf("Versão:      %s\nPainel:      %s\nCliente:     %s\nMáquina:     %s (%s)\nEndpoint:    %s\nServiço:     %s\n",
		Version, c.URL, c.ClientName, c.Name, c.Role, c.EndpointID, serviceStatus())
	if c.Remote != nil {
		fmt.Printf("Checagens:   %d\nEquipamentos: %v\n", len(c.Remote.Probes), c.Remote.Collect)
	}
}

func cmdOnce(args []string) {
	fs := flag.NewFlagSet("once", flag.ExitOnError)
	dry := fs.Bool("dry-run", false, "não envia, só mostra o JSON")
	_ = fs.Parse(args)
	setupLog(false)
	c, err := loadConfig()
	if err != nil && !*dry {
		log.Fatalf("Agente não configurado (%v). Rode: mororo-agent install", err)
	}
	if c == nil {
		c = &Config{URL: DefaultURL, Role: "workstation", MachineID: machineID()}
	}
	a := newAgent(c)
	a.dryRun = *dry
	if err := a.cycle(true); err != nil {
		log.Fatal(err)
	}
}

func cmdScan(args []string) {
	fs := flag.NewFlagSet("scan", flag.ExitOnError)
	cidr := fs.String("cidr", "", "rede a varrer (padrão: redes locais)")
	_ = fs.Parse(args)
	nets, err := scanTargets(*cidr)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Varrendo %v...\n", nets)
	res := scanNetwork(nets, func(done, total int) {
		fmt.Printf("\r%d/%d", done, total)
	})
	fmt.Println()
	for _, d := range res {
		fmt.Printf("%-16s %-18s %-14s %-28s %v\n", d.IP, d.MAC, d.DeviceType, trim(d.Hostname+" "+d.Vendor, 28), d.OpenPorts)
	}
}

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}

var errNotConfigured = errors.New("agente não configurado")
