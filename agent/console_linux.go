//go:build linux

package main

import "fmt"

func attachParentConsole() {}

func wizardWindow(url string, closeFn func()) {}

func fatalBox(msg string) { fmt.Println(msg) }
