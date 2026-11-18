//go:build windows

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/image/bmp"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Componente que roda na sessão do usuário (Run no logon): desenha as informações de suporte
// sobre o papel de parede escolhido pelo usuário, no canto da tela, e atualiza a cada 10 minutos.

const desktopRegKey = `Software\MororoAgent`

func userDir() string {
	d := os.Getenv("LOCALAPPDATA")
	if d == "" {
		d = os.TempDir()
	}
	return filepath.Join(d, "MororoAgent")
}

func cmdDesktop(args []string) {
	fs := flag.NewFlagSet("desktop", flag.ContinueOnError)
	loop := fs.Bool("loop", false, "continua atualizando")
	restore := fs.Bool("restore", false, "volta o papel de parede original")
	_ = fs.Parse(args)

	_ = os.MkdirAll(userDir(), 0o755)
	if f, err := os.OpenFile(filepath.Join(userDir(), "desktop.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		log.SetOutput(f)
	}
	if *restore {
		restoreWallpaper()
		return
	}
	// Uma instância por usuário.
	name, _ := syscall.UTF16PtrFromString(`Local\MororoAgentDesktop`)
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		if !*loop {
			applyDesktop(true)
		}
		return
	}
	if h != 0 {
		defer windows.CloseHandle(h)
	}
	setDPIAware()
	last := ""
	for {
		sig := applyDesktopSig(last)
		last = sig
		if !*loop {
			return
		}
		time.Sleep(10 * time.Minute)
	}
}

func setDPIAware() {
	u32 := windows.NewLazySystemDLL("user32.dll")
	if p := u32.NewProc("SetProcessDPIAware"); p.Find() == nil {
		_, _, _ = p.Call()
	}
}

func screenSize() (int, int) {
	u32 := windows.NewLazySystemDLL("user32.dll")
	gsm := u32.NewProc("GetSystemMetrics")
	w, _, _ := gsm.Call(0)
	h, _, _ := gsm.Call(1)
	if w < 640 || h < 480 {
		return 1920, 1080
	}
	return int(w), int(h)
}

func readDesktopState() (*DesktopState, error) {
	b, err := os.ReadFile(desktopStatePath())
	if err != nil {
		return nil, err
	}
	var s DesktopState
	return &s, json.Unmarshal(b, &s)
}

func applyDesktop(force bool) { applyDesktopSig("") }

// applyDesktopSig redesenha só quando algo mudou (IP, usuário, papel de parede, resolução).
func applyDesktopSig(last string) string {
	st, err := readDesktopState()
	if err != nil {
		log.Printf("desktop.json indisponível: %v", err)
		return last
	}
	if !st.Enabled {
		restoreWallpaper()
		return "disabled"
	}
	orig := originalWallpaper()
	w, h := screenSize()
	user := os.Getenv("USERNAME")
	if d := os.Getenv("USERDOMAIN"); d != "" && !strings.EqualFold(d, st.Hostname) {
		user = d + `\` + user
	}
	var mt time.Time
	if fi, err := os.Stat(orig); err == nil {
		mt = fi.ModTime()
	}
	sig := fmt.Sprintf("%s|%v|%s|%s|%dx%d|%s|%v|%v", st.Hostname, st.IPs, user, orig, w, h, st.RemoteID, st.Settings, mt)
	if sig == last && fileExists(currentOurPath()) {
		return sig
	}
	img := renderWallpaper(st, user, orig, w, h)
	out := filepath.Join(userDir(), fmt.Sprintf("wallpaper-%d.bmp", time.Now().Unix()%2))
	var buf bytes.Buffer
	if err := bmp.Encode(&buf, img); err != nil {
		log.Printf("bmp: %v", err)
		return last
	}
	if err := os.WriteFile(out, buf.Bytes(), 0o644); err != nil {
		log.Printf("gravar papel de parede: %v", err)
		return last
	}
	if k, _, err := registry.CreateKey(registry.CURRENT_USER, `Control Panel\Desktop`, registry.SET_VALUE); err == nil {
		_ = k.SetStringValue("WallpaperStyle", "10") // preencher
		_ = k.SetStringValue("TileWallpaper", "0")
		k.Close()
	}
	if err := setWallpaper(out); err != nil {
		log.Printf("aplicar papel de parede: %v", err)
		return last
	}
	setReg("Current", out)
	// Remove a versão anterior.
	for _, f := range []string{"wallpaper-0.bmp", "wallpaper-1.bmp"} {
		if p := filepath.Join(userDir(), f); p != out {
			_ = os.Remove(p)
		}
	}
	return sig
}

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }

func getReg(name string) string {
	k, err := registry.OpenKey(registry.CURRENT_USER, desktopRegKey, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, _ := k.GetStringValue(name)
	return v
}

func setReg(name, val string) {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, desktopRegKey, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()
	_ = k.SetStringValue(name, val)
}

func currentOurPath() string { return getReg("Current") }

func systemWallpaper() string {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Control Panel\Desktop`, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, _ := k.GetStringValue("WallPaper")
	return v
}

// originalWallpaper: o fundo escolhido pelo usuário (atualiza se ele trocar depois).
func originalWallpaper() string {
	cur := systemWallpaper()
	if cur != "" && !strings.HasPrefix(strings.ToLower(cur), strings.ToLower(userDir())) {
		setReg("Original", cur)
		return cur
	}
	return getReg("Original")
}

func setWallpaper(path string) error {
	u32 := windows.NewLazySystemDLL("user32.dll")
	p, _ := syscall.UTF16PtrFromString(path)
	r, _, err := u32.NewProc("SystemParametersInfoW").Call(0x0014, 0, uintptr(unsafe.Pointer(p)), 0x01|0x02)
	if r == 0 {
		return err
	}
	return nil
}

func restoreWallpaper() {
	orig := getReg("Original")
	cur := systemWallpaper()
	if strings.HasPrefix(strings.ToLower(cur), strings.ToLower(userDir())) || cur == "" {
		_ = setWallpaper(orig) // vazio = cor sólida
	}
}
