package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
)

// InstallRequest é usado pelo assistente e pela instalação silenciosa.
type InstallRequest struct {
	URL         string           `json:"url"`
	Token       string           `json:"token"`
	Role        string           `json:"role"`
	Name        string           `json:"name"`
	Services    []string         `json:"services"`
	DesktopInfo bool             `json:"desktop_info"`
	InsecureTLS bool             `json:"insecure_tls"`
	Devices     []map[string]any `json:"devices"`
	Discovery   []Discovered     `json:"discovery"`
}

type InstallResult struct {
	OK         bool             `json:"ok"`
	Steps      []string         `json:"steps"`
	Error      string           `json:"error,omitempty"`
	ClientName string           `json:"client_name,omitempty"`
	EndpointID string           `json:"endpoint_id,omitempty"`
	Devices    []map[string]any `json:"devices,omitempty"`
}

func doInstall(req InstallRequest) (res InstallResult) {
	step := func(f string, a ...any) {
		s := fmt.Sprintf(f, a...)
		res.Steps = append(res.Steps, s)
		log.Print(s)
	}
	fail := func(err error) InstallResult {
		res.Error = err.Error()
		return res
	}
	if !isAdmin() {
		return fail(fmt.Errorf("execute como administrador"))
	}
	if req.URL == "" {
		req.URL = DefaultURL
	}
	if req.Role != "server" {
		req.Role = "workstation"
	}
	api := newAPI(req.URL, req.Token)
	var who whoamiResp
	if err := api.Agent("whoami", nil, &who); err != nil {
		return fail(fmt.Errorf("token recusado pelo painel: %w", err))
	}
	res.ClientName = who.Client.Name
	step("Token válido — cliente %s", who.Client.Name)

	old, _ := loadConfig()
	c := &Config{
		URL: strings.TrimRight(req.URL, "/"), Token: strings.TrimSpace(req.Token), MachineID: machineID(), Role: req.Role,
		Name: strings.TrimSpace(req.Name), ClientName: who.Client.Name, Services: req.Services,
		DesktopInfo: req.DesktopInfo, InsecureTLS: req.InsecureTLS,
	}
	if old != nil && old.MachineID != "" {
		c.MachineID = old.MachineID
	}
	a := newAgent(c)
	if err := a.enroll(); err != nil {
		return fail(fmt.Errorf("cadastro da máquina: %w", err))
	}
	res.EndpointID = c.EndpointID
	step("Máquina cadastrada como %s", map[string]string{"server": "servidor", "workstation": "estação de trabalho"}[c.Role])

	if len(req.Discovery) > 0 {
		if err := api.Agent("discovery", map[string]any{"endpoint_id": c.EndpointID, "devices": req.Discovery}, nil); err != nil {
			step("Aviso: não foi possível salvar a varredura da rede (%v)", err)
		} else {
			step("Varredura da rede salva (%d equipamentos)", len(req.Discovery))
		}
	}
	if len(req.Devices) > 0 {
		var r struct {
			Results []map[string]any `json:"results"`
			Config  *RemoteConfig    `json:"config"`
		}
		if err := api.Agent("register-devices", map[string]any{"endpoint_id": c.EndpointID, "devices": req.Devices}, &r); err != nil {
			step("Aviso: falha ao cadastrar equipamentos (%v)", err)
		} else {
			res.Devices = r.Results
			ok := 0
			for _, d := range r.Results {
				if d["ok"] == true {
					ok++
				}
			}
			step("%d de %d equipamento(s)/checagem(ns) cadastrados", ok, len(r.Results))
			if r.Config != nil {
				c.Remote = r.Config
			}
		}
	}
	if err := saveConfig(c); err != nil {
		return fail(fmt.Errorf("salvar configuração: %w", err))
	}
	if err := installService(); err != nil {
		return fail(err)
	}
	step("Serviço %s instalado e iniciado", ServiceDisplayName)
	if msg := postInstallOS(c); msg != "" {
		step("%s", msg)
	}
	res.OK = true
	return res
}

func cmdInstall(args []string) {
	fs := flag.NewFlagSet("install", flag.ExitOnError)
	token := fs.String("token", "", "token do agente (painel > Monitor de Servidores > Agentes)")
	url := fs.String("url", DefaultURL, "endereço do backend do vigilant")
	role := fs.String("role", "", "server ou workstation")
	name := fs.String("name", "", "nome exibido no painel (padrão: hostname)")
	services := fs.String("services", "", "serviços a monitorar, separados por vírgula")
	noDesktop := fs.Bool("no-desktop", false, "não mostrar informações no papel de parede")
	secure := fs.Bool("secure-tls", false, "exigir certificado válido em iLO/Proxmox")
	quiet := fs.Bool("quiet", false, "instala sem abrir o assistente")
	listen := fs.String("listen", "127.0.0.1:0", "endereço do assistente (use túnel SSH em servidores sem tela)")
	if args != nil {
		_ = fs.Parse(args)
	}

	if !*quiet {
		if !isAdmin() {
			if relaunchElevated(args) {
				return
			}
			fatalBox("O assistente precisa de privilégios de administrador (no Linux, use sudo).")
			os.Exit(1)
		}
		runWizard(*listen, *url)
		return
	}

	setupLog(false)
	if *token == "" {
		log.Fatal("--token é obrigatório na instalação silenciosa")
	}
	r := *role
	if r == "" {
		r = guessRole()
	}
	var svc []string
	for _, s := range strings.Split(*services, ",") {
		if s = strings.TrimSpace(s); s != "" {
			svc = append(svc, s)
		}
	}
	res := doInstall(InstallRequest{URL: *url, Token: *token, Role: r, Name: *name, Services: svc, DesktopInfo: !*noDesktop, InsecureTLS: !*secure})
	if !res.OK {
		log.Fatalf("Instalação falhou: %s", res.Error)
	}
	fmt.Println("Instalação concluída.")
}

func guessRole() string {
	osName, _ := osIdentity()
	if strings.Contains(strings.ToLower(osName), "server") || osFamily() == "linux" {
		return "server"
	}
	return "workstation"
}

func cmdUninstall(args []string) {
	setupLog(false)
	if !isAdmin() {
		if relaunchElevated(append([]string{"uninstall"}, args...)) {
			return
		}
		log.Fatal("execute como administrador")
	}
	if err := uninstallService(); err != nil {
		log.Printf("serviço: %v", err)
	}
	uninstallOS()
	_ = os.Remove(configPath())
	_ = os.Remove(desktopStatePath())
	fmt.Println("Mororo.Tech Agent removido. A máquina continua listada no painel até ser excluída lá.")
}
