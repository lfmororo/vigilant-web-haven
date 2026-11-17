package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/kardianos/service"
)

type program struct {
	stop chan struct{}
	done chan struct{}
}

func (p *program) Start(s service.Service) error {
	p.stop = make(chan struct{})
	p.done = make(chan struct{})
	go func() {
		defer close(p.done)
		c, err := loadConfig()
		for err != nil {
			log.Printf("aguardando configuração (%v)", err)
			select {
			case <-p.stop:
				return
			case <-time.After(time.Minute):
			}
			c, err = loadConfig()
		}
		newAgent(c).loop(p.stop)
	}()
	return nil
}

func (p *program) Stop(s service.Service) error {
	close(p.stop)
	select {
	case <-p.done:
	case <-time.After(20 * time.Second):
	}
	return nil
}

func installedExe() string {
	if runtime.GOOS == "windows" {
		pf := os.Getenv("ProgramFiles")
		if pf == "" {
			pf = `C:\Program Files`
		}
		return filepath.Join(pf, "MororoTech", "Agent", "mororo-agent.exe")
	}
	return "/usr/local/bin/mororo-agent"
}

func svcConfig() *service.Config {
	opts := service.KeyValue{}
	if runtime.GOOS == "windows" {
		opts["StartType"] = "automatic"
		opts["OnFailure"] = "restart"
		opts["OnFailureDelayDuration"] = "30s"
		opts["OnFailureResetPeriod"] = 3600
	} else {
		opts["Restart"] = "always"
		opts["SuccessExitStatus"] = "1 2 8 SIGKILL"
	}
	return &service.Config{
		Name:        ServiceName,
		DisplayName: ServiceDisplayName,
		Description: ServiceDescription,
		Executable:  installedExe(),
		Arguments:   []string{"run"},
		Option:      opts,
	}
}

func newService() (service.Service, error) {
	return service.New(&program{}, svcConfig())
}

func runService() {
	interactive := service.Interactive()
	setupLog(!interactive)
	if interactive {
		log.SetOutput(io.MultiWriter(os.Stderr, logWriter()))
	}
	s, err := newService()
	if err != nil {
		log.Fatal(err)
	}
	if err := s.Run(); err != nil {
		log.Fatal(err)
	}
}

func logWriter() io.Writer {
	dir := filepath.Join(stateDir(), "logs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return io.Discard
	}
	f, err := os.OpenFile(filepath.Join(dir, "agent.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return io.Discard
	}
	return f
}

func serviceStatus() string {
	s, err := newService()
	if err != nil {
		return "erro: " + err.Error()
	}
	st, err := s.Status()
	if err != nil {
		if strings.Contains(err.Error(), "not installed") {
			return "não instalado"
		}
		return "desconhecido (" + err.Error() + ")"
	}
	switch st {
	case service.StatusRunning:
		return "em execução"
	case service.StatusStopped:
		return "parado"
	}
	return "desconhecido"
}

// installService copia o executável, (re)cria o serviço e o inicia.
func installService() error {
	s, err := newService()
	if err != nil {
		return err
	}
	_ = s.Stop()
	time.Sleep(2 * time.Second)
	if err := copySelf(installedExe()); err != nil {
		return fmt.Errorf("copiar executável: %w", err)
	}
	_ = s.Uninstall() // atualiza parâmetros quando já existia
	if err := s.Install(); err != nil {
		return fmt.Errorf("criar serviço: %w", err)
	}
	if err := s.Start(); err != nil {
		return fmt.Errorf("iniciar serviço: %w", err)
	}
	return nil
}

func copySelf(dst string) error {
	src, err := os.Executable()
	if err != nil {
		return err
	}
	if a, _ := filepath.EvalSymlinks(src); a != "" {
		src = a
	}
	if strings.EqualFold(filepath.Clean(src), filepath.Clean(dst)) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	out.Close()
	// No Windows o .exe antigo pode estar em uso (desktop helper): renomeia antes.
	if _, err := os.Stat(dst); err == nil {
		old := dst + ".old"
		_ = os.Remove(old)
		if err := os.Rename(dst, old); err != nil {
			return err
		}
	}
	return os.Rename(tmp, dst)
}

func uninstallService() error {
	s, err := newService()
	if err != nil {
		return err
	}
	_ = s.Stop()
	return s.Uninstall()
}
