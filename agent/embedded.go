package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"strings"
)

// Instalador por cliente: o painel anexa ao final do executável um bloco
//
//	\n#MORORO-CFG#<base64(json)>#END#\n
//
// com o endereço, o token e o papel da máquina. O executável continua igual
// (o Windows e o Linux ignoram bytes depois do fim do programa); só o agente lê esse bloco.

const (
	embedStart = "#MORORO-CFG#"
	embedEnd   = "#END#"
)

type EmbeddedConfig struct {
	URL         string   `json:"url"`
	Token       string   `json:"token"`
	Role        string   `json:"role"`     // server | workstation | "" (perguntar)
	Client      string   `json:"client"`   // nome do cliente, só para exibir
	Mode        string   `json:"mode"`     // quick (instala direto) | wizard (abre o assistente)
	Services    []string `json:"services"` // opcional
	DesktopInfo *bool    `json:"desktop"`  // opcional (padrão: sim)
	InsecureTLS *bool    `json:"insecure"` // opcional (padrão: sim)
}

var embeddedCache *EmbeddedConfig
var embeddedRead bool

// readEmbedded procura o bloco nos últimos 16 KB do próprio executável.
func readEmbedded() *EmbeddedConfig {
	if embeddedRead {
		return embeddedCache
	}
	embeddedRead = true
	exe, err := os.Executable()
	if err != nil {
		return nil
	}
	f, err := os.Open(exe)
	if err != nil {
		return nil
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil
	}
	size := st.Size()
	n := int64(16 << 10)
	if size < n {
		n = size
	}
	buf := make([]byte, n)
	if _, err := f.ReadAt(buf, size-n); err != nil && err != io.EOF {
		return nil
	}
	i := bytes.LastIndex(buf, []byte(embedStart))
	if i < 0 {
		return nil
	}
	rest := buf[i+len(embedStart):]
	j := bytes.Index(rest, []byte(embedEnd))
	if j < 0 {
		return nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(rest[:j])))
	if err != nil {
		return nil
	}
	var c EmbeddedConfig
	if json.Unmarshal(raw, &c) != nil || strings.TrimSpace(c.Token) == "" {
		return nil
	}
	if c.URL == "" {
		c.URL = DefaultURL
	}
	embeddedCache = &c
	return embeddedCache
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func roleLabel(r string) string {
	if r == "server" {
		return "servidor"
	}
	return "estação de trabalho"
}

// quickInstall: instalador por cliente no modo direto (confirmação + instalação silenciosa).
func quickInstall(e *EmbeddedConfig) {
	role := e.Role
	if role != "server" && role != "workstation" {
		role = guessRole()
	}
	h, _ := os.Hostname()
	msg := "Instalar o Mororo.Tech Agent neste computador?\n\n" +
		"Cliente: " + firstNonEmpty(e.Client, "—") + "\n" +
		"Computador: " + h + "\n" +
		"Tipo: " + roleLabel(role) + "\n\n" +
		"O agente envia monitoramento e inventário para a Mororo.Tech."
	if !confirmBox(msg) {
		return
	}
	res := doInstall(InstallRequest{
		URL: e.URL, Token: e.Token, Role: role, Services: e.Services,
		DesktopInfo: boolOr(e.DesktopInfo, true), InsecureTLS: boolOr(e.InsecureTLS, true),
	})
	if !res.OK {
		fatalBox("Não foi possível instalar o Mororo.Tech Agent:\n\n" + res.Error)
		os.Exit(1)
	}
	infoBox("Mororo.Tech Agent instalado.\n\n" + strings.Join(res.Steps, "\n"))
}
