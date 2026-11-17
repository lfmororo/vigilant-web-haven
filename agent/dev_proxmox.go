package main

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Porte do public/proxmox-collector.js (API REST do Proxmox VE).

type pveAuth struct {
	base    string
	headers map[string]string
	cl      *http.Client
}

func pveCredentials(d map[string]any) (user, tokenName, secret string) {
	user = sval(d, "username")
	if user == "" {
		user = "root@pam"
	}
	tokenName = strings.TrimPrefix(sval(d, "token_name"), "PVEAPIToken=")
	if i := strings.Index(tokenName, "!"); i >= 0 {
		if u := strings.TrimSpace(tokenName[:i]); u != "" {
			user = u
		}
		tokenName = strings.TrimSpace(tokenName[i+1:])
	}
	if i := strings.Index(user, "!"); i >= 0 {
		if tokenName == "" {
			tokenName = strings.TrimSpace(user[i+1:])
		}
		user = strings.TrimSpace(user[:i])
	}
	if !strings.Contains(user, "@") {
		user += "@pam"
	}
	return user, tokenName, sval(d, "token_secret")
}

func pveTicket(cl *http.Client, base, user, password string) (map[string]string, error) {
	form := url.Values{"username": {user}, "password": {password}}
	resp, err := cl.PostForm(base+"/api2/json/access/ticket", form)
	if err != nil {
		return nil, simplifyNetErr(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("login por senha recusado (HTTP %d)", resp.StatusCode)
	}
	var r struct {
		Data struct {
			Ticket string `json:"ticket"`
		} `json:"data"`
	}
	if err := decodeJSON(resp, &r); err != nil || r.Data.Ticket == "" {
		return nil, fmt.Errorf("não foi possível obter o ticket de autenticação")
	}
	return map[string]string{"Cookie": "PVEAuthCookie=" + r.Data.Ticket}, nil
}

func pveLogin(d map[string]any, insecure bool) (*pveAuth, error) {
	cl := deviceHTTP(insecure, 20*time.Second)
	base := fmt.Sprintf("https://%s:%d", sval(d, "host"), ival(d, "port", 8006))
	user, tokenName, secret := pveCredentials(d)
	password := sval(d, "password")
	if sval(d, "auth_mode") != "password" && tokenName != "" && secret != "" {
		h := map[string]string{"Authorization": fmt.Sprintf("PVEAPIToken=%s!%s=%s", user, tokenName, secret)}
		err := getJSON(cl, base+"/api2/json/version", h, nil)
		if err == nil {
			return &pveAuth{base, h, cl}, nil
		}
		if !strings.Contains(err.Error(), "401") {
			return nil, err
		}
		if password == "" {
			return nil, fmt.Errorf("token rejeitado pelo Proxmox (401) para %s!%s. Confira o Token ID, o Secret e, com 'Privilege Separation', conceda PVEAuditor em / ao token", user, tokenName)
		}
	}
	if password == "" {
		return nil, fmt.Errorf("sem token nem senha configurada")
	}
	h, err := pveTicket(cl, base, user, password)
	if err != nil {
		return nil, err
	}
	return &pveAuth{base, h, cl}, nil
}

func (p *pveAuth) get(path string) (any, error) {
	var r struct {
		Data any `json:"data"`
	}
	err := getJSON(p.cl, p.base+"/api2/json"+path, p.headers, &r)
	if err != nil && regexp.MustCompile(`HTTP 59\d`).MatchString(err.Error()) {
		return nil, fmt.Errorf("%v — o Proxmox não alcançou %s (nome do nó, nó offline ou cluster sem quorum)", err, path)
	}
	return r.Data, err
}

func (p *pveAuth) opt(path string) any {
	v, err := p.get(path)
	if err != nil {
		return nil
	}
	return v
}

func collectProxmox(d map[string]any, insecure bool) map[string]any {
	id := sval(d, "id")
	auth, err := pveLogin(d, insecure)
	if err != nil {
		return offline("proxmox", "node_id", id, err.Error())
	}
	nodesV, err := auth.get("/nodes")
	if err != nil {
		return offline("proxmox", "node_id", id, err.Error())
	}
	var cands []string
	add := func(s string) {
		if s == "" {
			return
		}
		for _, c := range cands {
			if c == s {
				return
			}
		}
		cands = append(cands, s)
	}
	add(sval(d, "node_name"))
	for _, n := range ja(nodesV) {
		if js(jm(n)["status"]) == "online" {
			add(js(jm(n)["node"]))
		}
	}
	for _, n := range ja(nodesV) {
		add(js(jm(n)["node"]))
	}
	var node string
	var status map[string]any
	var lastErr error
	for _, c := range cands {
		v, err := auth.get("/nodes/" + c + "/status")
		if err == nil {
			node, status = c, jm(v)
			break
		}
		lastErr = err
	}
	if node == "" {
		msg := "nenhum nó encontrado na API do Proxmox"
		if lastErr != nil {
			msg = fmt.Sprintf("não foi possível ler o status dos nós (%s): %v", strings.Join(cands, ", "), lastErr)
		}
		return offline("proxmox", "node_id", id, msg)
	}
	ver := jm(auth.opt("/version"))
	memory, swap, rootfs, cpuinfo := jm(status["memory"]), jm(status["swap"]), jm(status["rootfs"]), jm(status["cpuinfo"])
	info := map[string]any{
		"node_name": node, "cpu_model": nilIfEmpty(js(cpuinfo["model"])), "cpu_cores": cpuinfo["cpus"],
		"ram_total_gb": toGB(memory["total"]), "ram_used_gb": toGB(memory["used"]), "ram_usage_pct": pctOf(memory["used"], memory["total"]),
		"swap_total_gb": toGB(swap["total"]), "swap_used_gb": toGB(swap["used"]),
		"disk_total_gb": toGB(rootfs["total"]), "disk_used_gb": toGB(rootfs["used"]), "disk_usage_pct": pctOf(rootfs["used"], rootfs["total"]),
		"uptime_seconds": status["uptime"],
	}
	if v := js(ver["version"]); v != "" {
		info["pve_version"] = "PVE " + v
	}
	if c, ok := jf(status["cpu"]); ok {
		info["cpu_usage_pct"] = round1(c * 100)
	}
	if w, ok := jf(status["wait"]); ok {
		info["iowait_pct"] = round1(w * 100)
	}
	if la := ja(status["loadavg"]); len(la) > 0 {
		if f, ok := jf(la[0]); ok {
			info["load_avg"] = f
		}
	}

	storages := []map[string]any{}
	for _, s := range ja(auth.opt("/nodes/" + node + "/storage")) {
		sm := jm(s)
		if a, ok := jf(sm["active"]); ok && a == 0 {
			continue
		}
		storages = append(storages, map[string]any{
			"name": sm["storage"], "type": sm["type"], "total_gb": toGB(sm["total"]), "used_gb": toGB(sm["used"]),
			"free_gb": toGB(sm["avail"]), "usage_pct": pctOf(sm["used"], sm["total"]),
		})
	}

	guests := []map[string]any{}
	for _, kind := range []string{"qemu", "lxc"} {
		for _, g := range ja(auth.opt("/nodes/" + node + "/" + kind)) {
			gm := jm(g)
			name := js(gm["name"])
			if name == "" {
				name = fmt.Sprintf("VM %v", gm["vmid"])
			}
			st := js(gm["status"])
			if st == "" {
				st = "unknown"
			}
			e := map[string]any{
				"vmid": gm["vmid"], "name": name, "guest_type": kind, "status": st, "cpu_count": gm["cpus"],
				"ram_total_gb": toGB(gm["maxmem"]), "ram_used_gb": toGB(gm["mem"]), "ram_usage_pct": pctOf(gm["mem"], gm["maxmem"]),
				"disk_total_gb": toGB(gm["maxdisk"]), "disk_used_gb": toGB(gm["disk"]), "uptime_seconds": gm["uptime"],
				"tags": nilIfEmpty(js(gm["tags"])),
			}
			if c, ok := jf(gm["cpu"]); ok {
				e["cpu_usage_pct"] = round1(c * 100)
			}
			guests = append(guests, e)
		}
	}

	return map[string]any{
		"type": "proxmox", "node_id": id, "status": "online", "info": info, "storages": storages, "guests": guests,
		"interfaces": pveInterfaces(auth, node, status), "agent_version": "mororo-agent " + Version,
	}
}

func pveInterfaces(auth *pveAuth, node string, status map[string]any) []map[string]any {
	redes := ja(auth.opt("/nodes/" + node + "/network"))
	rrdHour := ja(auth.opt("/nodes/" + node + "/rrddata?timeframe=hour&cf=AVERAGE"))
	rrdDay := ja(auth.opt("/nodes/" + node + "/rrddata?timeframe=day&cf=AVERAGE"))

	netin, okIn := jf(status["netin"])
	netout, okOut := jf(status["netout"])
	if !okIn && !okOut {
		for i := len(rrdHour) - 1; i >= 0; i-- {
			p := jm(rrdHour[i])
			a, ok1 := jf(p["netin"])
			b, ok2 := jf(p["netout"])
			if ok1 || ok2 {
				netin, netout, okIn, okOut = a, b, true, true
				break
			}
		}
	}
	total := func(metric string) any {
		type pt struct{ t, v float64 }
		var pts []pt
		for _, p := range rrdDay {
			pm := jm(p)
			t, ok1 := jf(pm["time"])
			v, ok2 := jf(pm[metric])
			if ok1 && ok2 {
				pts = append(pts, pt{t, v})
			}
		}
		if len(pts) < 2 {
			return nil
		}
		sort.Slice(pts, func(i, j int) bool { return pts[i].t < pts[j].t })
		var sum float64
		for i := 1; i < len(pts); i++ {
			sec := pts[i].t - pts[i-1].t
			if sec < 0 {
				sec = 0
			}
			if sec > 1800 {
				sec = 1800
			}
			sum += pts[i-1].v * sec
		}
		return int64(sum)
	}
	ignore := regexp.MustCompile(`^(lo|veth|fwln|fwpr|tap|docker|br-)`)
	var list []map[string]any
	for _, r := range redes {
		rm := jm(r)
		ifc := js(rm["iface"])
		if ifc == "" || ignore.MatchString(ifc) {
			continue
		}
		st := "down"
		if a, ok := jf(rm["active"]); ok && a == 1 {
			st = "up"
		}
		ip := js(rm["address"])
		if ip == "" {
			ip = js(rm["cidr"])
		}
		list = append(list, map[string]any{
			"interface_name": ifc, "status": st, "mac_address": nilIfEmpty(js(rm["hwaddr"])), "speed_mbps": nil,
			"rx_bytes": nil, "tx_bytes": nil, "rx_rate_bps": nil, "tx_rate_bps": nil, "rx_errors": nil, "tx_errors": nil,
			"ip_address": nilIfEmpty(ip),
		})
	}
	if len(list) == 0 {
		list = append(list, map[string]any{"interface_name": "trafego-total", "status": "up", "mac_address": nil, "speed_mbps": nil,
			"rx_bytes": nil, "tx_bytes": nil, "rx_rate_bps": nil, "tx_rate_bps": nil, "rx_errors": nil, "tx_errors": nil, "ip_address": nil})
	}
	pick := func(f func(m map[string]any) bool) map[string]any {
		for _, i := range list {
			if f(i) {
				return i
			}
		}
		return nil
	}
	main := pick(func(m map[string]any) bool {
		return m["status"] == "up" && m["ip_address"] != nil && strings.HasPrefix(js(m["interface_name"]), "vmbr")
	})
	if main == nil {
		main = pick(func(m map[string]any) bool { return m["status"] == "up" && m["ip_address"] != nil })
	}
	if main == nil {
		main = pick(func(m map[string]any) bool { return m["status"] == "up" })
	}
	if main == nil {
		main = list[0]
	}
	if okIn || okOut {
		main["rx_rate_bps"] = int64(netin * 8)
		main["tx_rate_bps"] = int64(netout * 8)
	}
	main["rx_bytes"] = total("netin")
	main["tx_bytes"] = total("netout")
	return list
}

func nilIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
