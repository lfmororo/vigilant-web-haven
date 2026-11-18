//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/kardianos/service"
	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows/registry"
)

func isWindowsService() bool { return !service.Interactive() }

func osMachineID() string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, _ := k.GetStringValue("MachineGuid")
	return v
}

func osIdentity() (string, string) {
	var osi []struct{ Caption, Version string }
	if err := wmi.Query("SELECT Caption, Version FROM Win32_OperatingSystem", &osi); err == nil && len(osi) > 0 {
		return strings.TrimSpace(osi[0].Caption), osi[0].Version
	}
	return "Windows", ""
}

// hiddenCmd executa sem abrir janela de console.
func hiddenCmd(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

func restrictConfigACL(path string) {
	// SYSTEM e Administradores (SIDs, independente do idioma do Windows).
	_ = hiddenCmd("icacls", path, "/inheritance:r", "/grant:r", "*S-1-5-18:F", "*S-1-5-32-544:F").Run()
}

// restrictDirACL: só SYSTEM/Administradores gravam na pasta; usuários apenas leem (desktop.json).
func restrictDirACL(dir string) {
	_ = hiddenCmd("icacls", dir, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-32-545:(OI)(CI)RX").Run()
}

func powershellJSON(script string, out any) error {
	cmd := hiddenCmd("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
		"[Console]::OutputEncoding=[Text.Encoding]::UTF8;"+script)
	b, err := cmd.Output()
	if err != nil {
		return err
	}
	s := strings.TrimSpace(string(b))
	if s == "" {
		return nil
	}
	if !strings.HasPrefix(s, "[") { // um único objeto
		s = "[" + s + "]"
	}
	return json.Unmarshal([]byte(s), out)
}

// ---------------------------------------------------------------- métricas

type win32Service struct {
	Name             string
	DisplayName      string
	State            string
	StartMode        string
	DelayedAutoStart *bool
}

type win32CS struct {
	UserName            *string
	Manufacturer        string
	Model               string
	Domain              string
	PartOfDomain        bool
	PCSystemType        uint16
	TotalPhysicalMemory uint64
}

func collectOSMetrics(m *HostMetrics, c *Config) {
	m.Services = windowsServices(c)
	m.PendingReboot = windowsPendingReboot()
	m.Events = windowsEvents()
	m.PhysicalDisks = windowsPhysicalDisks()
	m.Antivirus = windowsAntivirus()
	var cs []win32CS
	if err := wmi.Query("SELECT UserName FROM Win32_ComputerSystem", &cs); err == nil && len(cs) > 0 && cs[0].UserName != nil {
		m.LoggedUser = *cs[0].UserName
	}
	m.RemoteID = remoteAccessID()
	var osi []struct{ Caption, Version string }
	if err := wmi.Query("SELECT Caption, Version FROM Win32_OperatingSystem", &osi); err == nil && len(osi) > 0 {
		m.OSName = strings.TrimSpace(osi[0].Caption)
		m.OSVersion = osi[0].Version
	}
	// Previsão de falha por letra de unidade (mesma regra do coletor antigo: qualquer disco com falha marca os volumes).
	for _, pd := range m.PhysicalDisks {
		if pd.Predict {
			for i := range m.Disks {
				m.Disks[i].Predict = true
			}
			break
		}
	}
	for i := range m.Disks {
		m.Disks[i].Label = volumeLabel(m.Disks[i].Mount)
	}
}

func volumeLabel(mount string) string {
	var v []struct{ VolumeName string }
	q := fmt.Sprintf("SELECT VolumeName FROM Win32_LogicalDisk WHERE DeviceID='%s'", strings.TrimRight(mount, `\`))
	if err := wmi.Query(q, &v); err == nil && len(v) > 0 {
		return v[0].VolumeName
	}
	return ""
}

// Serviços: os escolhidos + automáticos que estão parados (exceto os "atrasados"/gatilho que param sozinhos).
var ignoreAutoStopped = regexp.MustCompile(`(?i)^(gupdate|gupdatem|edgeupdate|edgeupdatem|MapsBroker|sppsvc|RemoteRegistry|wuauserv|BITS|TrustedInstaller|ShellHWDetection|CDPSvc|tiledatamodelsvc|WbioSrvc|clr_optimization.*|sedsvc|Intel.*|GoogleUpdater.*|DoSvc|UsoSvc|WaaSMedicSvc|BthAvctpSvc|camsvc|StateRepository|OneSyncSvc.*|CDPUserSvc.*|WpnUserService.*|MSDTC|NetTcpPortSharing|AdobeARMservice|SysMain|wscsvc)$`)

func windowsServices(c *Config) []ServiceInfo {
	var list []win32Service
	if err := wmi.Query("SELECT Name, DisplayName, State, StartMode, DelayedAutoStart FROM Win32_Service", &list); err != nil {
		_ = wmi.Query("SELECT Name, DisplayName, State, StartMode FROM Win32_Service", &list)
	}
	want := map[string]bool{}
	for _, s := range c.services() {
		want[strings.ToLower(s)] = true
	}
	var out []ServiceInfo
	for _, s := range list {
		chosen := want[strings.ToLower(s.Name)]
		delayed := s.DelayedAutoStart != nil && *s.DelayedAutoStart
		autoStopped := c.role() == "server" && s.StartMode == "Auto" && s.State != "Running" && !delayed && !ignoreAutoStopped.MatchString(s.Name)
		if chosen || autoStopped {
			out = append(out, ServiceInfo{Name: s.Name, DisplayName: s.DisplayName, Status: s.State, StartMode: s.StartMode})
		}
	}
	return out
}

func listLocalServices() []ServiceInfo {
	var list []win32Service
	_ = wmi.Query("SELECT Name, DisplayName, State, StartMode FROM Win32_Service", &list)
	out := make([]ServiceInfo, 0, len(list))
	for _, s := range list {
		out = append(out, ServiceInfo{Name: s.Name, DisplayName: s.DisplayName, Status: s.State, StartMode: s.StartMode})
	}
	return out
}

func regKeyExists(path string) bool {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return false
	}
	k.Close()
	return true
}

func windowsPendingReboot() bool {
	return regKeyExists(`SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending`) ||
		regKeyExists(`SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`)
}

// Eventos críticos/erro do log System desde a última coleta (máx. 50).
func windowsEvents() []EventInfo {
	statePath := filepath.Join(stateDir(), "events.since")
	since := time.Now().Add(-15 * time.Minute)
	if b, err := os.ReadFile(statePath); err == nil {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(string(b))); err == nil && time.Since(t) < 24*time.Hour {
			since = t
		}
	}
	now := time.Now()
	script := fmt.Sprintf(`$s=[datetime]::Parse('%s').ToLocalTime(); Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=$s} -MaxEvents 50 -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ level=$_.Level; source=$_.ProviderName; id=$_.Id; time=$_.TimeCreated.ToUniversalTime().ToString('o'); msg=(''+$_.Message) } } | ConvertTo-Json -Compress -Depth 2`,
		since.UTC().Format(time.RFC3339))
	var raw []struct {
		Level  int    `json:"level"`
		Source string `json:"source"`
		ID     int    `json:"id"`
		Time   string `json:"time"`
		Msg    string `json:"msg"`
	}
	if err := powershellJSON(script, &raw); err != nil {
		return nil
	}
	_ = os.WriteFile(statePath, []byte(now.UTC().Format(time.RFC3339)), 0o644)
	out := make([]EventInfo, 0, len(raw))
	for _, e := range raw {
		lvl := "Error"
		if e.Level == 1 {
			lvl = "Critical"
		}
		msg := strings.TrimSpace(e.Msg)
		if len([]rune(msg)) > 300 {
			msg = string([]rune(msg)[:300])
		}
		out = append(out, EventInfo{Level: lvl, Source: e.Source, EventID: e.ID, Time: e.Time, Message: msg})
	}
	return out
}

func windowsPhysicalDisks() []PhysDisk {
	var pd []struct {
		FriendlyName string
		SerialNumber string
		MediaType    uint16
		Size         uint64
		HealthStatus uint16
		DeviceId     string
	}
	_ = wmi.QueryNamespace("SELECT FriendlyName, SerialNumber, MediaType, Size, HealthStatus, DeviceId FROM MSFT_PhysicalDisk", &pd, `root\Microsoft\Windows\Storage`)

	var fp []struct {
		InstanceName   string
		PredictFailure bool
	}
	_ = wmi.QueryNamespace("SELECT InstanceName, PredictFailure FROM MSStorageDriver_FailurePredictStatus", &fp, `root\wmi`)
	anyPredict := false
	for _, f := range fp {
		if f.PredictFailure {
			anyPredict = true
		}
	}

	media := map[uint16]string{3: "HDD", 4: "SSD", 5: "SCM"}
	health := map[uint16]string{0: "Healthy", 1: "Warning", 2: "Unhealthy"}
	var out []PhysDisk
	for _, d := range pd {
		h := health[d.HealthStatus]
		out = append(out, PhysDisk{
			Name: "Disk " + d.DeviceId, Model: strings.TrimSpace(d.FriendlyName), Serial: strings.TrimSpace(d.SerialNumber),
			Media: media[d.MediaType], SizeGB: gb(d.Size), Health: h, Predict: h == "Unhealthy" || (anyPredict && len(pd) == 1),
		})
	}
	if len(out) == 0 && anyPredict {
		out = append(out, PhysDisk{Name: "Disco", Health: "Unhealthy", Predict: true})
	}
	return out
}

func windowsAntivirus() []Antivirus {
	var av []struct {
		DisplayName  string
		ProductState uint32
	}
	var out []Antivirus
	if err := wmi.QueryNamespace("SELECT displayName, productState FROM AntiVirusProduct", &av, `root\SecurityCenter2`); err == nil {
		for _, a := range av {
			s := fmt.Sprintf("%06x", a.ProductState)
			out = append(out, Antivirus{Name: a.DisplayName, Enabled: s[2:4] == "10" || s[2:4] == "11", UpToDate: s[4:6] == "00"})
		}
	}
	if len(out) > 0 {
		return out
	}
	// Windows Server não tem SecurityCenter2: consulta o Defender.
	var mp []struct {
		AntivirusEnabled      bool
		AntivirusSignatureAge uint32
	}
	if err := wmi.QueryNamespace("SELECT AntivirusEnabled, AntivirusSignatureAge FROM MSFT_MpComputerStatus", &mp, `root\Microsoft\Windows\Defender`); err == nil && len(mp) > 0 {
		out = append(out, Antivirus{Name: "Microsoft Defender", Enabled: mp[0].AntivirusEnabled, UpToDate: mp[0].AntivirusSignatureAge <= 3})
	}
	return out
}

var reRustID = regexp.MustCompile(`(?m)^\s*id\s*=\s*'?"?([0-9]{6,12})`)
var reAnyID = regexp.MustCompile(`(?m)^ad\.anynet\.id=(\d+)`)

// remoteAccessID procura o ID do RustDesk (servidor próprio da Mororo.Tech) ou do AnyDesk.
func remoteAccessID() string {
	paths := []string{
		filepath.Join(os.Getenv("WINDIR"), `ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk.toml`),
	}
	if m, _ := filepath.Glob(`C:\Users\*\AppData\Roaming\RustDesk\config\RustDesk.toml`); len(m) > 0 {
		paths = append(paths, m...)
	}
	for _, p := range paths {
		if b, err := os.ReadFile(p); err == nil {
			if mm := reRustID.FindSubmatch(b); mm != nil {
				return "RustDesk " + spaced(string(mm[1]))
			}
		}
	}
	if b, err := os.ReadFile(filepath.Join(os.Getenv("ProgramData"), `AnyDesk\system.conf`)); err == nil {
		if mm := reAnyID.FindSubmatch(b); mm != nil {
			return "AnyDesk " + spaced(string(mm[1]))
		}
	}
	return ""
}

func spaced(id string) string {
	var b strings.Builder
	for i, r := range id {
		if i > 0 && (len(id)-i)%3 == 0 {
			b.WriteByte(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ---------------------------------------------------------------- inventário

func collectOSInventory(inv *Inventory) {
	var cs []win32CS
	if err := wmi.Query("SELECT Manufacturer, Model, Domain, PartOfDomain, PCSystemType, TotalPhysicalMemory FROM Win32_ComputerSystem", &cs); err == nil && len(cs) > 0 {
		inv.Manufacturer = strings.TrimSpace(cs[0].Manufacturer)
		inv.Model = strings.TrimSpace(cs[0].Model)
		if cs[0].PartOfDomain {
			inv.Domain = cs[0].Domain
		} else {
			inv.Domain = "WORKGROUP:" + cs[0].Domain
		}
		inv.IsLaptop = cs[0].PCSystemType == 2
	}
	var bios []struct{ SerialNumber, SMBIOSBIOSVersion string }
	if err := wmi.Query("SELECT SerialNumber, SMBIOSBIOSVersion FROM Win32_BIOS", &bios); err == nil && len(bios) > 0 {
		inv.SerialNumber = strings.TrimSpace(bios[0].SerialNumber)
		inv.BIOSVersion = strings.TrimSpace(bios[0].SMBIOSBIOSVersion)
	}
	var cpus []struct {
		Name          string
		NumberOfCores uint32
	}
	if err := wmi.Query("SELECT Name, NumberOfCores FROM Win32_Processor", &cpus); err == nil && len(cpus) > 0 {
		inv.CPUModel = strings.TrimSpace(cpus[0].Name)
		n := 0
		for _, c := range cpus {
			n += int(c.NumberOfCores)
		}
		inv.CPUCores = n
	}
	var osi []struct{ Caption, Version, BuildNumber string }
	if err := wmi.Query("SELECT Caption, Version, BuildNumber FROM Win32_OperatingSystem", &osi); err == nil && len(osi) > 0 {
		inv.OSName = strings.TrimSpace(osi[0].Caption)
		inv.OSVersion = osi[0].Version
	}
	inv.Software = windowsSoftware()
}

func windowsSoftware() []Software {
	seen := map[string]bool{}
	var out []Software
	read := func(root registry.Key, path string, access uint32) {
		k, err := registry.OpenKey(root, path, registry.ENUMERATE_SUB_KEYS|registry.QUERY_VALUE|access)
		if err != nil {
			return
		}
		defer k.Close()
		names, _ := k.ReadSubKeyNames(-1)
		for _, n := range names {
			sk, err := registry.OpenKey(k, n, registry.QUERY_VALUE|access)
			if err != nil {
				continue
			}
			name, _, _ := sk.GetStringValue("DisplayName")
			sys, _, _ := sk.GetIntegerValue("SystemComponent")
			parent, _, _ := sk.GetStringValue("ParentKeyName")
			ver, _, _ := sk.GetStringValue("DisplayVersion")
			pub, _, _ := sk.GetStringValue("Publisher")
			date, _, _ := sk.GetStringValue("InstallDate")
			sk.Close()
			name = strings.TrimSpace(name)
			if name == "" || sys == 1 || parent != "" {
				continue
			}
			key := strings.ToLower(name + "|" + ver)
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, Software{Name: name, Version: ver, Publisher: pub, InstallDate: date})
		}
	}
	const p = `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
	read(registry.LOCAL_MACHINE, p, registry.WOW64_64KEY)
	read(registry.LOCAL_MACHINE, p, registry.WOW64_32KEY)
	// Programas instalados só para usuários com sessão carregada.
	if users, err := registry.OpenKey(registry.USERS, "", registry.ENUMERATE_SUB_KEYS); err == nil {
		sids, _ := users.ReadSubKeyNames(-1)
		users.Close()
		for _, sid := range sids {
			if strings.HasPrefix(sid, "S-1-5-21-") && !strings.HasSuffix(sid, "_Classes") {
				read(registry.USERS, sid+`\`+p, 0)
			}
		}
	}
	return out
}
