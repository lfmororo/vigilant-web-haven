//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"net"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows: IcmpSendEcho (iphlpapi), o mesmo mecanismo do ping.exe — não depende de socket bruto nem do firewall.
var (
	iphlpapi        = windows.NewLazySystemDLL("iphlpapi.dll")
	procIcmpCreate  = iphlpapi.NewProc("IcmpCreateFile")
	procIcmpClose   = iphlpapi.NewProc("IcmpCloseHandle")
	procIcmpSend    = iphlpapi.NewProc("IcmpSendEcho")
)

func osPing(ip net.IP, count int, timeout time.Duration) (float64, float64, error) {
	if err := procIcmpCreate.Find(); err != nil {
		return 0, 0, err
	}
	h, _, err := procIcmpCreate.Call()
	if h == 0 || h == uintptr(windows.InvalidHandle) {
		return 0, 0, fmt.Errorf("IcmpCreateFile: %v", err)
	}
	defer procIcmpClose.Call(h)
	ip4 := ip.To4()
	if ip4 == nil {
		return 0, 0, fmt.Errorf("IPv4 obrigatório")
	}
	addr := binary.LittleEndian.Uint32(ip4) // IPAddr em ordem de rede, lido como uint32 nativo
	data := []byte("mororo-agent")
	reply := make([]byte, 128+len(data))
	var total float64
	recv := 0
	for i := 0; i < count; i++ {
		n, _, _ := procIcmpSend.Call(h, uintptr(addr), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), 0,
			uintptr(unsafe.Pointer(&reply[0])), uintptr(len(reply)), uintptr(timeout.Milliseconds()))
		if n == 0 {
			continue
		}
		// ICMP_ECHO_REPLY: Address(4) Status(4) RoundTripTime(4) ...
		status := binary.LittleEndian.Uint32(reply[4:8])
		rtt := binary.LittleEndian.Uint32(reply[8:12])
		if status == 0 && binary.LittleEndian.Uint32(reply[0:4]) == addr {
			total += float64(rtt)
			recv++
		}
	}
	loss := round1(float64(count-recv) / float64(count) * 100)
	if recv == 0 {
		return 0, 100, nil
	}
	return round1(total / float64(recv)), loss, nil
}
