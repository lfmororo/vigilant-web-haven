package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// API conversa com as Edge Functions do vigilant-web-haven.
type API struct {
	URL   string
	Token string
	http  *http.Client
}

func newAPI(url, token string) *API {
	return &API{
		URL:   strings.TrimRight(url, "/"),
		Token: strings.TrimSpace(token),
		http:  &http.Client{Timeout: 60 * time.Second},
	}
}

type apiError struct {
	Status int
	Msg    string
}

func (e *apiError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Msg) }

// Call envia JSON para /functions/v1/<fn> e decodifica a resposta em out (se não for nil).
func (a *API) Call(fn string, body any, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*attempt) * 2 * time.Second)
		}
		req, _ := http.NewRequest(http.MethodPost, a.URL+"/functions/v1/"+fn, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
		req.Header.Set("x-monitor-token", a.Token)
		req.Header.Set("User-Agent", "mororo-agent/"+Version)
		resp, err := a.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
		resp.Body.Close()
		if resp.StatusCode >= 500 || resp.StatusCode == 429 {
			lastErr = &apiError{resp.StatusCode, errMsg(data)}
			continue
		}
		if resp.StatusCode >= 400 {
			return &apiError{resp.StatusCode, errMsg(data)}
		}
		if out != nil && len(data) > 0 {
			if err := json.Unmarshal(data, out); err != nil {
				return fmt.Errorf("resposta inválida de %s: %w", fn, err)
			}
		}
		return nil
	}
	return lastErr
}

func errMsg(data []byte) string {
	var e struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(data, &e) == nil && e.Error != "" {
		return e.Error
	}
	s := strings.TrimSpace(string(data))
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

// Agent chama endpoint-agent com uma action.
func (a *API) Agent(action string, body map[string]any, out any) error {
	if body == nil {
		body = map[string]any{}
	}
	body["action"] = action
	return a.Call("endpoint-agent", body, out)
}

// Ingest envia para server-monitor-ingest (mesmo formato dos coletores antigos).
func (a *API) Ingest(payload map[string]any) error {
	return a.Call("server-monitor-ingest", payload, nil)
}

type whoamiResp struct {
	Client struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"client"`
	LatestVersion string `json:"latest_version"`
}

type enrollResp struct {
	EndpointID      string        `json:"endpoint_id"`
	WindowsServerID string        `json:"windows_server_id"`
	LinuxServerID   string        `json:"linux_server_id"`
	Config          *RemoteConfig `json:"config"`
}

type configResp struct {
	Config *RemoteConfig `json:"config"`
}

type reportResp struct {
	LatestVersion string `json:"latest_version"`
	Outdated      bool   `json:"outdated"`
}
