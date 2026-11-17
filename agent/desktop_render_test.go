package main

import (
	"image/png"
	"os"
	"testing"
)

func TestRenderWallpaper(t *testing.T) {
	out := os.Getenv("WALLPAPER_OUT")
	if out == "" {
		t.Skip("defina WALLPAPER_OUT para gerar a prévia")
	}
	st := &DesktopState{Hostname: "RECEPCAO-01", IPs: []string{"192.168.0.25"}, OS: "Windows 11 Pro",
		RemoteID: "RustDesk 123 456 789", ClientName: "Depósito E.C. Mororó",
		Settings: DesktopSettings{Company: "Mororo.Tech", Phone: "(88) 99999-0000", Message: "Precisa de ajuda? Chame a Mororo.Tech no WhatsApp."}}
	img := renderWallpaper(st, `ECMORORO\joao`, os.Getenv("WALLPAPER_BG"), 1920, 1080)
	f, err := os.Create(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}
