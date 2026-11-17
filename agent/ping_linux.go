//go:build linux

package main

import (
	"net"
	"time"
)

// Linux: socket ICMP bruto (o serviço roda como root).
func osPing(ip net.IP, count int, timeout time.Duration) (float64, float64, error) {
	return icmpPing(ip, count, timeout)
}
