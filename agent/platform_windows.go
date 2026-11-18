//go:build windows

package main

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func isAdmin() bool {
	var sid *windows.SID
	err := windows.AllocateAndInitializeSid(&windows.SECURITY_NT_AUTHORITY, 2,
		windows.SECURITY_BUILTIN_DOMAIN_RID, windows.DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &sid)
	if err != nil {
		return false
	}
	defer windows.FreeSid(sid)
	ok, err := windows.Token(0).IsMember(sid)
	return err == nil && ok
}

// relaunchElevated abre o próprio executável com UAC ("Executar como administrador").
func relaunchElevated(args []string) bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(exe)
	a := args
	if len(a) == 0 {
		a = []string{"install"}
	} else if a[0] != "install" && a[0] != "uninstall" {
		a = append([]string{"install"}, a...)
	}
	params, _ := syscall.UTF16PtrFromString(quoteArgs(a))
	cwd, _ := syscall.UTF16PtrFromString("")
	return windows.ShellExecute(0, verb, file, params, cwd, windows.SW_NORMAL) == nil
}

func quoteArgs(a []string) string {
	q := make([]string, len(a))
	for i, s := range a {
		if strings.ContainsAny(s, " \t\"") {
			s = `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
		}
		q[i] = s
	}
	return strings.Join(q, " ")
}

func openBrowser(url string) {
	_ = hiddenCmd("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

const (
	runKey       = `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
	runValue     = "MororoAgentDesktop"
	uninstallKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MororoAgent`
)

// postInstallOS: atalho do papel de parede no logon, entrada em "Aplicativos instalados".
func postInstallOS(c *Config) string {
	exe := installedExe()
	msg := ""
	if k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, runKey, registry.SET_VALUE|registry.WOW64_64KEY); err == nil {
		if c.DesktopInfo {
			_ = k.SetStringValue(runValue, `"`+exe+`" desktop --loop`)
			msg = "Informações de suporte ativadas no papel de parede"
			// Já aplica para o usuário atual.
			cmd := exec.Command(exe, "desktop", "--loop")
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000 | 0x00000008} // sem janela, desanexado
			_ = cmd.Start()
		} else {
			_ = k.DeleteValue(runValue)
		}
		k.Close()
	}
	if noARP {
		return msg
	}
	if k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, uninstallKey, registry.SET_VALUE|registry.WOW64_64KEY); err == nil {
		_ = k.SetStringValue("DisplayName", ServiceDisplayName)
		_ = k.SetStringValue("DisplayVersion", Version)
		_ = k.SetStringValue("Publisher", "Mororo.Tech")
		_ = k.SetStringValue("DisplayIcon", exe+",0")
		_ = k.SetStringValue("UninstallString", `"`+exe+`" uninstall`)
		_ = k.SetStringValue("InstallLocation", strings.TrimSuffix(exe, `\mororo-agent.exe`))
		_ = k.SetStringValue("URLInfoAbout", "https://mororo.tech")
		_ = k.SetDWordValue("NoModify", 1)
		_ = k.SetDWordValue("NoRepair", 1)
		k.Close()
	}
	return msg
}

func uninstallOS(keepFiles bool) {
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE, runKey, registry.SET_VALUE|registry.WOW64_64KEY); err == nil {
		_ = k.DeleteValue(runValue)
		k.Close()
	}
	_ = registry.DeleteKey(registry.LOCAL_MACHINE, uninstallKey)
	// Fecha o helper do papel de parede e restaura o fundo do usuário atual.
	_ = hiddenCmd("taskkill", "/F", "/IM", "mororo-agent.exe", "/FI", "PID ne "+strconv.Itoa(os.Getpid())).Run()
	restoreWallpaper()
	if keepFiles {
		return
	}
	// Apaga o executável instalado depois que este processo terminar.
	exe := installedExe()
	_ = hiddenCmd("cmd", "/C", "ping -n 3 127.0.0.1 >nul & del /F /Q \""+exe+"\" \""+exe+".old\" & rmdir \""+strings.TrimSuffix(exe, `\mororo-agent.exe`)+"\"").Start()
}

// isWindowsGUI: sem console de quem chamou (duplo clique / Aplicativos instalados).
func isWindowsGUI() bool {
	k32 := windows.NewLazySystemDLL("kernel32.dll")
	h, _, _ := k32.NewProc("GetConsoleWindow").Call()
	return h == 0
}
