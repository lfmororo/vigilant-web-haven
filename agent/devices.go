package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// collectDevices coleta os equipamentos atribuídos a este agente e envia para server-monitor-ingest.
func collectDevices(a *agent) {
	col := a.c.Remote.Collect
	if col["proxmox"] {
		a.forEachDevice("list-proxmox", func(d map[string]any) map[string]any { return collectProxmox(d, a.c.InsecureTLS) })
	}
	if col["ilo"] {
		a.forEachDevice("list-ilo", func(d map[string]any) map[string]any { return collectRedfish(d, a.c.InsecureTLS) })
	}
	if col["vmware"] {
		a.forEachDevice("list-vmware", func(d map[string]any) map[string]any { return collectVMware(d) })
	}
	if col["sqlserver"] {
		a.forEachDevice("list-sqlserver", func(d map[string]any) map[string]any { return collectSQLServer(d) })
	}
}

func (a *agent) forEachDevice(listType string, fn func(map[string]any) map[string]any) {
	var list []map[string]any
	if err := a.api.Call("server-monitor-ingest", map[string]any{"type": listType, "endpoint_id": a.c.EndpointID}, &list); err != nil {
		log.Printf("%s: %v", listType, err)
		return
	}
	for _, d := range list {
		name := sval(d, "name")
		start := time.Now()
		payload := func() (p map[string]any) {
			defer func() {
				if r := recover(); r != nil {
					p = nil
					log.Printf("%s %s: falha inesperada: %v", listType, name, r)
				}
			}()
			return fn(d)
		}()
		if payload == nil {
			continue
		}
		if a.dryRun {
			dump(listType+" → "+name, payload)
			continue
		}
		if err := a.api.Ingest(payload); err != nil {
			log.Printf("%s %s: envio falhou: %v", listType, name, err)
		} else {
			log.Printf("%s %s: %s em %s", strings.TrimPrefix(listType, "list-"), name, sval(payload, "status"), time.Since(start).Round(time.Millisecond))
		}
	}
}

func sval(m map[string]any, k string) string {
	if v, ok := m[k]; ok && v != nil {
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}

func ival(m map[string]any, k string, def int) int {
	switch v := m[k].(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	case int:
		if v > 0 {
			return v
		}
	case string:
		var n int
		if _, err := fmt.Sscan(v, &n); err == nil && n > 0 {
			return n
		}
	}
	return def
}

// ---------------------------------------------------------------- HTTP JSON (equipamentos)

func deviceHTTP(insecure bool, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: insecure},
			TLSHandshakeTimeout: 10 * time.Second,
			MaxIdleConnsPerHost: 4,
		},
	}
}

func getJSON(cl *http.Client, url string, headers map[string]string, out any) error {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := cl.Do(req)
	if err != nil {
		return simplifyNetErr(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if resp.StatusCode == 401 {
		return fmt.Errorf("credenciais inválidas (401)")
	}
	if resp.StatusCode >= 400 {
		s := strings.TrimSpace(string(b))
		if len(s) > 200 {
			s = s[:200]
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, s)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("resposta inválida (não-JSON)")
	}
	return nil
}

// Helpers para navegar em JSON genérico.
func jm(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func ja(v any) []any {
	if a, ok := v.([]any); ok {
		return a
	}
	return nil
}

func jf(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case string:
		var f float64
		if _, err := fmt.Sscan(x, &f); err == nil {
			return f, true
		}
	}
	return 0, false
}

func js(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func toGB(v any) any {
	if f, ok := jf(v); ok && f > 0 {
		return round1(f / (1 << 30))
	}
	return nil
}

func pctOf(used, total any) any {
	u, ok1 := jf(used)
	t, ok2 := jf(total)
	if ok1 && ok2 && t > 0 {
		return round1(u / t * 100)
	}
	return nil
}

func offline(typ, idKey, id, err string) map[string]any {
	if len(err) > 500 {
		err = err[:500]
	}
	return map[string]any{"type": typ, idKey: id, "status": "offline", "last_error": err, "agent_version": "mororo-agent " + Version}
}

func decodeJSON(resp *http.Response, out any) error {
	b, err := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}
