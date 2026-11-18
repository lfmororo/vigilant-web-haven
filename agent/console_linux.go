//go:build linux

package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func attachParentConsole() {}

func wizardWindow(url string, closeFn func()) {}

func fatalBox(msg string) { fmt.Println(msg) }

func infoBox(msg string) { fmt.Println(msg) }

func confirmBox(msg string) bool {
	fmt.Println(msg)
	if fi, err := os.Stdin.Stat(); err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return true // sem terminal (script): segue
	}
	fmt.Print("Continuar? [S/n] ")
	l, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	l = strings.ToLower(strings.TrimSpace(l))
	return l == "" || l == "s" || l == "sim" || l == "y"
}
