//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// O .exe é compilado como aplicativo gráfico (sem janela de console no duplo clique,
// no serviço e no papel de parede). Nos comandos de terminal, reaproveita o console de quem chamou.
func attachParentConsole() {
	k32 := windows.NewLazySystemDLL("kernel32.dll")
	r, _, _ := k32.NewProc("AttachConsole").Call(uintptr(^uint32(0))) // ATTACH_PARENT_PROCESS
	if r == 0 {
		return
	}
	if f, err := os.OpenFile("CONOUT$", os.O_WRONLY, 0); err == nil {
		os.Stdout, os.Stderr = f, f
	}
	if f, err := os.OpenFile("CONIN$", os.O_RDONLY, 0); err == nil {
		os.Stdin = f
	}
}

func messageBox(title, text string, flags uint32) int {
	u32 := windows.NewLazySystemDLL("user32.dll")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := u32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(flags))
	return int(r)
}

// wizardWindow mostra uma janela simples enquanto o assistente roda no navegador; OK encerra.
func wizardWindow(url string, closeFn func()) {
	go func() {
		messageBox("Mororo.Tech Agent",
			"O assistente de instalação foi aberto no navegador.\n\nSe ele não abriu, acesse:\n"+url+
				"\n\nClique em OK para encerrar o assistente.", 0x40|0x40000) // MB_ICONINFORMATION | MB_TOPMOST
		closeFn()
	}()
}

func fatalBox(msg string) {
	messageBox("Mororo.Tech Agent", msg, 0x10)
}

func infoBox(msg string) { messageBox("Mororo.Tech Agent", msg, 0x40) }

// confirmBox: Sim/Não (MB_YESNO | MB_ICONQUESTION); IDYES = 6.
func confirmBox(msg string) bool { return messageBox("Mororo.Tech Agent", msg, 0x04|0x20) == 6 }
