//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
)

func isAdmin() bool { return os.Geteuid() == 0 }

func relaunchElevated(args []string) bool { return false }

func openBrowser(url string) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return
	}
	_ = exec.Command("xdg-open", url).Start()
}

func postInstallOS(c *Config) string {
	return fmt.Sprintf("Logs em %s/logs/agent.log — teste com: sudo mororo-agent once", stateDir())
}

func uninstallOS(keepFiles bool) {
	if !keepFiles {
		_ = os.Remove(installedExe())
	}
}

func isWindowsGUI() bool { return false }

// Papel de parede: só no Windows.
func cmdDesktop(args []string) {
	fmt.Println("As informações no papel de parede estão disponíveis apenas no Windows.")
}

func restoreWallpaper() {}
