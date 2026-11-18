package main

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed wizard.html
var wizardHTML string

//go:embed assets/logo.png
var logoPNG []byte

//go:embed assets/icon-256.png
var iconPNG []byte

type scanState struct {
	sync.Mutex
	Running bool         `json:"running"`
	Done    int          `json:"done"`
	Total   int          `json:"total"`
	Nets    []string     `json:"nets"`
	Results []Discovered `json:"results"`
	Error   string       `json:"error,omitempty"`
}

// runWizard sobe a interface do assistente em 127.0.0.1 e abre o navegador.
func runWizard(listen, defaultURL string) {
	setupLog(false)
	keyB := make([]byte, 16)
	_, _ = rand.Read(keyB)
	key := hex.EncodeToString(keyB)
	scan := &scanState{}
	finished := make(chan struct{})
	var once sync.Once

	mux := http.NewServeMux()
	guard := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// Só a página aberta pelo assistente (chave aleatória) usa a API.
			if r.Header.Get("X-Wizard-Key") != key {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || r.URL.Query().Get("k") != key {
			http.Error(w, "Abra o endereço mostrado pelo assistente.", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, strings.Replace(wizardHTML, "__WIZARD_KEY__", key, 1))
	})
	mux.HandleFunc("/logo.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(logoPNG)
	})
	mux.HandleFunc("/icon.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(iconPNG)
	})
	mux.HandleFunc("/api/state", guard(func(w http.ResponseWriter, r *http.Request) {
		h, _ := os.Hostname()
		osName, _ := osIdentity()
		st := map[string]any{
			"version": Version, "default_url": defaultURL, "hostname": h, "os": osName, "os_family": osFamily(),
			"is_admin": isAdmin(), "suggested_role": guessRole(), "ips": localIPs(), "services": listLocalServices(),
			"installed": serviceStatus(),
		}
		if nets, err := scanTargets(""); err == nil {
			var s []string
			for _, n := range nets {
				s = append(s, n.String())
			}
			st["networks"] = s
		}
		if e := readEmbedded(); e != nil {
			st["embedded"] = map[string]any{"client": e.Client, "role": e.Role, "url": e.URL}
		}
		if c, err := loadConfig(); err == nil {
			st["config"] = map[string]any{"url": c.URL, "role": c.Role, "name": c.Name, "client_name": c.ClientName,
				"services": c.Services, "desktop_info": c.DesktopInfo, "has_token": c.Token != ""}
		}
		writeJSON(w, st)
	}))
	mux.HandleFunc("/api/verify", guard(func(w http.ResponseWriter, r *http.Request) {
		var req struct{ URL, Token string }
		_ = json.NewDecoder(r.Body).Decode(&req)
		if strings.TrimSpace(req.Token) == "" {
			req.Token, req.URL = fallbackToken(req.URL, defaultURL)
		}
		var who whoamiResp
		if err := newAPI(firstNonEmpty(req.URL, defaultURL), req.Token).Agent("whoami", nil, &who); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "client": who.Client.Name, "latest_version": who.LatestVersion})
	}))
	mux.HandleFunc("/api/scan", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var req struct{ CIDR string }
			_ = json.NewDecoder(r.Body).Decode(&req)
			scan.Lock()
			if scan.Running {
				scan.Unlock()
				writeJSON(w, map[string]any{"ok": false, "error": "varredura em andamento"})
				return
			}
			nets, err := scanTargets(req.CIDR)
			if err != nil {
				scan.Unlock()
				writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			scan.Running, scan.Done, scan.Total, scan.Results, scan.Error = true, 0, 0, nil, ""
			scan.Nets = nil
			for _, n := range nets {
				scan.Nets = append(scan.Nets, n.String())
			}
			scan.Unlock()
			go func() {
				res := scanNetwork(nets, func(d, t int) {
					scan.Lock()
					scan.Done, scan.Total = d, t
					scan.Unlock()
				})
				scan.Lock()
				scan.Results, scan.Running = res, false
				scan.Unlock()
			}()
			writeJSON(w, map[string]any{"ok": true})
			return
		}
		scan.Lock()
		defer scan.Unlock()
		writeJSON(w, scan)
	}))
	mux.HandleFunc("/api/test", guard(func(w http.ResponseWriter, r *http.Request) {
		var d map[string]any
		_ = json.NewDecoder(r.Body).Decode(&d)
		ok, msg := testDevice(d)
		writeJSON(w, map[string]any{"ok": ok, "message": msg})
	}))
	mux.HandleFunc("/api/install", guard(func(w http.ResponseWriter, r *http.Request) {
		var req InstallRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, InstallResult{Error: "pedido inválido: " + err.Error()})
			return
		}
		if strings.TrimSpace(req.Token) == "" {
			req.Token, req.URL = fallbackToken(req.URL, defaultURL)
		}
		writeJSON(w, doInstall(req))
	}))
	mux.HandleFunc("/api/close", guard(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true})
		once.Do(func() { close(finished) })
	}))

	ln, err := net.Listen("tcp", listen)
	if err != nil {
		log.Fatalf("não foi possível abrir o assistente: %v", err)
	}
	url := fmt.Sprintf("http://%s/?k=%s", ln.Addr().String(), key)
	if strings.HasPrefix(listen, "127.0.0.1") || strings.HasPrefix(listen, "localhost") {
		url = fmt.Sprintf("http://127.0.0.1:%d/?k=%s", ln.Addr().(*net.TCPAddr).Port, key)
	}
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.Serve(ln) }()

	fmt.Println("Mororo.Tech Agent — assistente de instalação")
	fmt.Println("Se o navegador não abrir, acesse:")
	fmt.Println("  " + url)
	if runtime.GOOS == "linux" {
		fmt.Printf("Servidor sem tela? No seu computador: ssh -L %d:127.0.0.1:%d usuario@servidor  e abra o endereço acima.\n",
			ln.Addr().(*net.TCPAddr).Port, ln.Addr().(*net.TCPAddr).Port)
	}
	openBrowser(url)
	wizardWindow(url, func() { once.Do(func() { close(finished) }) })

	select {
	case <-finished:
	case <-time.After(2 * time.Hour):
	}
	time.Sleep(500 * time.Millisecond)
	_ = srv.Close()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

// testDevice testa a conexão com um equipamento antes de cadastrá-lo.
func testDevice(d map[string]any) (bool, string) {
	kind := sval(d, "kind")
	insecure := true
	switch kind {
	case "proxmox":
		auth, err := pveLogin(d, insecure)
		if err != nil {
			return false, err.Error()
		}
		v, err := auth.get("/nodes")
		if err != nil {
			return false, err.Error()
		}
		var names []string
		for _, n := range ja(v) {
			names = append(names, js(jm(n)["node"]))
		}
		return true, "Conectado. Nós: " + strings.Join(names, ", ")
	case "ilo", "idrac":
		p := collectRedfish(d, insecure)
		if p["status"] == "offline" {
			return false, sval(p, "last_error")
		}
		info := jm(p["info"])
		return true, fmt.Sprintf("Conectado: %s %s — saúde %s", js(info["server_model"]), js(info["serial_number"]), js(info["health_summary"]))
	case "vmware":
		c, err := sshDial(sval(d, "host"), vmwareSSHPort(d), sval(d, "username"), sval(d, "password"))
		if err != nil {
			return false, "SSH: " + err.Error() + " (ative o SSH no ESXi: Host > Ações > Serviços > Habilitar SSH)"
		}
		defer c.Close()
		out := strings.TrimSpace(sshRun(c, "vmware -v"))
		if out == "" {
			return false, "Conectou por SSH, mas não parece ser um ESXi"
		}
		return true, out
	case "sqlserver":
		if err := sqlTest(d); err != nil {
			return false, err.Error()
		}
		return true, "Conectado ao SQL Server"
	case "ping", "tcp", "http":
		pr := Probe{Kind: kind, Target: firstNonEmpty(sval(d, "target"), sval(d, "host")), Port: ival(d, "port", 0), Keyword: sval(d, "keyword")}
		r := runProbe(pr, false)
		if r.Status != "up" {
			return false, firstNonEmpty(r.Error, "sem resposta")
		}
		msg := "Respondendo"
		if r.LatencyMs != nil {
			msg += fmt.Sprintf(" em %.0f ms", *r.LatencyMs)
		}
		if r.SSLExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, r.SSLExpiresAt); err == nil {
				msg += fmt.Sprintf(" — SSL válido até %s", t.Format("02/01/2006"))
			}
		}
		return true, msg
	}
	return false, "tipo desconhecido"
}

// fallbackToken: token embutido (instalador por cliente) ou o já salvo nesta máquina.
func fallbackToken(url, defaultURL string) (string, string) {
	if e := readEmbedded(); e != nil {
		return e.Token, firstNonEmpty(url, e.URL)
	}
	if c, err := loadConfig(); err == nil {
		return c.Token, firstNonEmpty(url, c.URL)
	}
	return "", firstNonEmpty(url, defaultURL)
}
