package main

import (
	"encoding/base64"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
)

// Coletor Redfish genérico: HP iLO 4/5/6 e Dell iDRAC 8/9 (porte de ilo-collector.js e idrac-collector.js).
// Descobre os caminhos pelas coleções (/Systems, /Managers, /Chassis) em vez de fixá-los por fabricante.

type redfish struct {
	base    string
	cl      *http.Client
	headers map[string]string
}

func (r *redfish) get(path string) (map[string]any, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	var out map[string]any
	err := getJSON(r.cl, r.base+path, r.headers, &out)
	return out, err
}

func (r *redfish) try(path string) map[string]any {
	if path == "" {
		return nil
	}
	m, err := r.get(path)
	if err != nil {
		return nil
	}
	return m
}

func odataID(v any) string { return js(jm(v)["@odata.id"]) }

func (r *redfish) firstMember(path string) string {
	c := r.try(path)
	for _, m := range ja(c["Members"]) {
		if id := odataID(m); id != "" {
			return id
		}
	}
	return ""
}

func rfHealth(o map[string]any) string {
	st := jm(o["Status"])
	if h := js(st["Health"]); h != "" {
		return h
	}
	if h := js(st["HealthRollup"]); h != "" {
		return h
	}
	return js(o["Health"])
}

func worstHealth(list []any) any {
	rank := map[string]int{"OK": 1, "Warning": 2, "Critical": 3}
	best, val := 0, ""
	for _, x := range list {
		h := rfHealth(jm(x))
		if rank[h] > best {
			best, val = rank[h], h
		}
	}
	return nilIfEmpty(val)
}

func oemHP(o map[string]any) map[string]any {
	oem := jm(o["Oem"])
	if hp := jm(oem["Hpe"]); len(hp) > 0 {
		return hp
	}
	return jm(oem["Hp"])
}

func numOrNil(v any) any {
	if f, ok := jf(v); ok {
		return f
	}
	return nil
}

func collectRedfish(d map[string]any, insecure bool) map[string]any {
	id := sval(d, "id")
	auth := base64.StdEncoding.EncodeToString([]byte(sval(d, "username") + ":" + sval(d, "password")))
	r := &redfish{
		base:    fmt.Sprintf("https://%s:%d", sval(d, "host"), ival(d, "port", 443)),
		cl:      deviceHTTP(insecure, 30*time.Second),
		headers: map[string]string{"Authorization": "Basic " + auth},
	}
	if _, err := r.get("/redfish/v1/"); err != nil {
		return offline("ilo", "server_id", id, err.Error())
	}
	sysPath := r.firstMember("/redfish/v1/Systems")
	if sysPath == "" {
		return offline("ilo", "server_id", id, "Redfish sem /Systems (usuário sem permissão?)")
	}
	sys, err := r.get(sysPath)
	if err != nil {
		return offline("ilo", "server_id", id, err.Error())
	}
	mgr := r.try(r.firstMember("/redfish/v1/Managers"))

	// Chassi principal: o primeiro que tem Thermal.
	var chassis map[string]any
	for _, c := range ja(jm(sys["Links"])["Chassis"]) {
		if m := r.try(odataID(c)); m != nil && jm(m["Thermal"])["@odata.id"] != nil {
			chassis = m
			break
		}
	}
	if chassis == nil {
		chassis = r.try(r.firstMember("/redfish/v1/Chassis"))
	}

	hp := oemHP(sys)
	cpuSum, memSum := jm(sys["ProcessorSummary"]), jm(sys["MemorySummary"])
	mgrHP := oemHP(mgr)
	mgrFw := js(mgr["FirmwareVersion"])
	if mgrFw == "" {
		mgrFw = js(jm(jm(mgrHP["FirmwareVersion"])["Current"])["VersionString"])
	}
	mgrModel := js(mgr["Model"])
	if mgrModel == "" {
		mgrModel = js(mgrHP["Type"])
	}
	info := map[string]any{
		"server_model": nilIfEmpty(js(sys["Model"])), "serial_number": nilIfEmpty(js(sys["SerialNumber"])),
		"bios_version": nilIfEmpty(js(sys["BiosVersion"])), "ilo_version": nilIfEmpty(mgrModel), "ilo_firmware": nilIfEmpty(mgrFw),
		"cpu_model": nilIfEmpty(js(cpuSum["Model"])), "cpu_count": numOrNil(cpuSum["Count"]),
		"ram_total_gb": numOrNil(memSum["TotalSystemMemoryGiB"]), "power_state": nilIfEmpty(js(sys["PowerState"])),
		"post_state": nilIfEmpty(js(hp["PostState"])), "indicator_led": nilIfEmpty(js(sys["IndicatorLED"])),
		"health_summary": nilIfEmpty(rfHealth(sys)),
	}

	var sensors []map[string]any
	var thermal, power map[string]any
	if chassis != nil {
		thermal = r.try(odataID(chassis["Thermal"]))
		power = r.try(odataID(chassis["Power"]))
	}
	for _, t := range ja(thermal["Temperatures"]) {
		tm := jm(t)
		reading := tm["ReadingCelsius"]
		if reading == nil {
			reading = tm["CurrentReading"]
		}
		if reading == nil {
			continue
		}
		if strings.EqualFold(js(jm(tm["Status"])["State"]), "Absent") {
			continue
		}
		upper := tm["UpperThresholdCritical"]
		if upper == nil {
			upper = tm["UpperThresholdFatal"]
		}
		sensors = append(sensors, map[string]any{
			"sensor_type": "temperature", "name": firstNonEmpty(js(tm["Name"]), "Sensor "+js(tm["Number"])),
			"reading": reading, "unit": "°C", "status": nilIfEmpty(js(jm(tm["Status"])["State"])), "health": nilIfEmpty(rfHealth(tm)),
			"upper_critical": numOrNil(upper), "location": nilIfEmpty(js(tm["PhysicalContext"])),
		})
	}
	for _, f := range ja(thermal["Fans"]) {
		fm := jm(f)
		if strings.EqualFold(js(jm(fm["Status"])["State"]), "Absent") {
			continue
		}
		reading := fm["Reading"]
		if reading == nil {
			reading = fm["CurrentReading"]
		}
		unit := firstNonEmpty(js(fm["ReadingUnits"]), js(fm["Units"]), "%")
		sensors = append(sensors, map[string]any{
			"sensor_type": "fan", "name": firstNonEmpty(js(fm["FanName"]), js(fm["Name"]), "Ventilador"),
			"reading": numOrNil(reading), "unit": unit, "status": nilIfEmpty(js(jm(fm["Status"])["State"])),
			"health": nilIfEmpty(rfHealth(fm)), "location": nilIfEmpty(js(fm["PhysicalContext"])),
		})
	}
	for _, p := range ja(power["PowerSupplies"]) {
		pm := jm(p)
		if strings.EqualFold(js(jm(pm["Status"])["State"]), "Absent") {
			continue
		}
		reading := pm["LastPowerOutputWatts"]
		if reading == nil {
			reading = pm["PowerCapacityWatts"]
		}
		sensors = append(sensors, map[string]any{
			"sensor_type": "power_supply", "name": firstNonEmpty(js(pm["Name"]), "Fonte "+js(jm(oemHP(pm))["BayNumber"])),
			"reading": numOrNil(reading), "unit": "W", "status": nilIfEmpty(js(jm(pm["Status"])["State"])),
			"health": nilIfEmpty(rfHealth(pm)), "location": nilIfEmpty(firstNonEmpty(js(pm["Model"]), js(pm["SerialNumber"]))),
			"details": map[string]any{"capacidade_w": numOrNil(pm["PowerCapacityWatts"]), "entrada_v": numOrNil(pm["LineInputVoltage"]),
				"modelo": nilIfEmpty(js(pm["Model"])), "serial": nilIfEmpty(js(pm["SerialNumber"])), "firmware": nilIfEmpty(js(pm["FirmwareVersion"]))},
		})
	}
	for _, v := range ja(power["Voltages"]) {
		vm := jm(v)
		if vm["ReadingVolts"] == nil {
			continue
		}
		sensors = append(sensors, map[string]any{
			"sensor_type": "voltage", "name": firstNonEmpty(js(vm["Name"]), "Voltagem"), "reading": numOrNil(vm["ReadingVolts"]),
			"unit": "V", "status": nilIfEmpty(js(jm(vm["Status"])["State"])), "health": nilIfEmpty(rfHealth(vm)),
			"upper_critical": numOrNil(vm["UpperThresholdCritical"]),
		})
	}
	disks := redfishStorage(r, sysPath, sys)
	sensors = append(sensors, disks...)

	diskAny := make([]any, 0, len(disks))
	for _, s := range disks {
		diskAny = append(diskAny, map[string]any{"Health": s["health"]})
	}
	agg := jm(hp["AggregateHealthStatus"])
	aggH := func(k string) string { return js(jm(jm(agg[k])["Status"])["Health"]) }
	health := map[string]any{
		"health_processor":   nilIfEmpty(rfHealth(map[string]any{"Status": cpuSum["Status"]})),
		"health_memory":      nilIfEmpty(rfHealth(map[string]any{"Status": memSum["Status"]})),
		"health_storage":     firstAny(nilIfEmpty(aggH("Storage")), worstHealth(diskAny)),
		"health_fans":        firstAny(nilIfEmpty(aggH("Fans")), worstHealth(ja(thermal["Fans"]))),
		"health_power":       firstAny(nilIfEmpty(aggH("PowerSupplies")), worstHealth(ja(power["PowerSupplies"]))),
		"health_temperature": firstAny(nilIfEmpty(aggH("Temperatures")), worstHealth(ja(thermal["Temperatures"]))),
		"health_network":     nilIfEmpty(aggH("Network")),
	}
	for _, v := range health {
		if v == "Critical" {
			info["health_summary"] = "Critical"
		}
	}
	if info["health_summary"] != "Critical" {
		for _, v := range health {
			if v == "Warning" {
				info["health_summary"] = "Warning"
			}
		}
	}
	status := "online"
	if hs := js(info["health_summary"]); hs == "Critical" || hs == "Warning" {
		status = "warning"
	}
	if sensors == nil {
		sensors = []map[string]any{}
	}
	return map[string]any{
		"type": "ilo", "server_id": id, "status": status, "info": info, "health": health,
		"sensors": sensors, "events": redfishEvents(r, sysPath, mgr), "agent_version": "mororo-agent " + Version,
	}
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

func firstAny(v ...any) any {
	for _, x := range v {
		if x != nil {
			return x
		}
	}
	return nil
}

func gibFromMiB(v any) any {
	if f, ok := jf(v); ok && f > 0 {
		return math.Round(f / 1024)
	}
	return nil
}

func redfishStorage(r *redfish, sysPath string, sys map[string]any) []map[string]any {
	var out []map[string]any
	// HP iLO 4/5: SmartStorage
	ctrls := r.try(strings.TrimRight(sysPath, "/") + "/SmartStorage/ArrayControllers/")
	for _, ref := range ja(ctrls["Members"]) {
		base := odataID(ref)
		ctrl := r.try(base)
		if ctrl == nil {
			continue
		}
		out = append(out, map[string]any{
			"sensor_type": "controller", "name": firstNonEmpty(js(ctrl["Model"]), "Controladora RAID"),
			"status": nilIfEmpty(js(jm(ctrl["Status"])["State"])), "health": nilIfEmpty(rfHealth(ctrl)), "location": nilIfEmpty(js(ctrl["Location"])),
			"details": map[string]any{"firmware": nilIfEmpty(js(jm(jm(ctrl["FirmwareVersion"])["Current"])["VersionString"])), "serial": nilIfEmpty(js(ctrl["SerialNumber"]))},
		})
		base = strings.TrimRight(base, "/") + "/"
		for _, lref := range ja(r.try(base + "LogicalDrives/")["Members"]) {
			ld := r.try(odataID(lref))
			if ld == nil {
				continue
			}
			out = append(out, map[string]any{
				"sensor_type": "logical_drive", "name": firstNonEmpty(js(ld["LogicalDriveName"]), "Volume "+js(ld["LogicalDriveNumber"])),
				"reading": gibFromMiB(ld["CapacityMiB"]), "unit": "GB", "status": nilIfEmpty(js(jm(ld["Status"])["State"])),
				"health": nilIfEmpty(rfHealth(ld)), "location": "RAID " + firstNonEmpty(js(ld["Raid"]), "?"),
				"details": map[string]any{"raid": nilIfEmpty(js(ld["Raid"]))},
			})
		}
		for _, pref := range ja(r.try(base + "DiskDrives/")["Members"]) {
			pd := r.try(odataID(pref))
			if pd == nil {
				continue
			}
			name := firstNonEmpty(js(pd["Location"]), js(pd["Name"]), "Disco")
			if m := js(pd["Model"]); m != "" {
				name += " — " + m
			}
			out = append(out, map[string]any{
				"sensor_type": "disk", "name": name, "reading": gibFromMiB(pd["CapacityMiB"]), "unit": "GB",
				"status": nilIfEmpty(js(jm(pd["Status"])["State"])), "health": nilIfEmpty(rfHealth(pd)), "location": nilIfEmpty(js(pd["Location"])),
				"details": map[string]any{"serial": nilIfEmpty(js(pd["SerialNumber"])), "interface": nilIfEmpty(js(pd["InterfaceType"])),
					"media": nilIfEmpty(js(pd["MediaType"])), "rpm": numOrNil(pd["RotationalSpeedRpm"]), "horas_uso": numOrNil(pd["PowerOnHours"]),
					"desgaste_ssd_pct": numOrNil(pd["SSDEnduranceUtilizationPercentage"])},
			})
		}
	}
	if len(out) > 0 {
		return out
	}
	// Padrão DMTF (iDRAC, iLO 5/6): /Systems/x/Storage
	st := r.try(odataID(sys["Storage"]))
	for _, sref := range ja(st["Members"]) {
		s := r.try(odataID(sref))
		if s == nil {
			continue
		}
		for _, c := range ja(s["StorageControllers"]) {
			cm := jm(c)
			out = append(out, map[string]any{
				"sensor_type": "controller", "name": firstNonEmpty(js(cm["Name"]), js(cm["Model"]), js(s["Name"]), "Controladora"),
				"status": nilIfEmpty(js(jm(cm["Status"])["State"])), "health": nilIfEmpty(rfHealth(cm)),
				"details": map[string]any{"firmware": nilIfEmpty(js(cm["FirmwareVersion"]))},
			})
		}
		for _, vref := range ja(r.try(odataID(s["Volumes"]))["Members"]) {
			v := r.try(odataID(vref))
			if v == nil {
				continue
			}
			var gbv any
			if f, ok := jf(v["CapacityBytes"]); ok && f > 0 {
				gbv = math.Round(f / 1e9)
			}
			out = append(out, map[string]any{
				"sensor_type": "logical_drive", "name": firstNonEmpty(js(v["Name"]), "Volume"), "reading": gbv, "unit": "GB",
				"status": nilIfEmpty(js(jm(v["Status"])["State"])), "health": nilIfEmpty(rfHealth(v)),
				"location": nilIfEmpty(firstNonEmpty(js(v["RAIDType"]), js(v["VolumeType"]))),
			})
		}
		for _, dref := range ja(s["Drives"]) {
			dr := r.try(odataID(dref))
			if dr == nil {
				continue
			}
			var gbv any
			if f, ok := jf(dr["CapacityBytes"]); ok && f > 0 {
				gbv = math.Round(f / 1e9)
			}
			name := firstNonEmpty(js(dr["Name"]), "Disco")
			if m := js(dr["Model"]); m != "" {
				name += " — " + strings.TrimSpace(m)
			}
			out = append(out, map[string]any{
				"sensor_type": "disk", "name": name, "reading": gbv, "unit": "GB",
				"status": nilIfEmpty(js(jm(dr["Status"])["State"])), "health": nilIfEmpty(rfHealth(dr)),
				"details": map[string]any{"serial": nilIfEmpty(js(dr["SerialNumber"])), "interface": nilIfEmpty(js(dr["Protocol"])),
					"media": nilIfEmpty(js(dr["MediaType"])), "vida_restante_pct": numOrNil(dr["PredictedMediaLifeLeftPercent"]),
					"falha_prevista": dr["FailurePredicted"]},
			})
		}
	}
	return out
}

func redfishEvents(r *redfish, sysPath string, mgr map[string]any) []map[string]any {
	paths := []string{strings.TrimRight(sysPath, "/") + "/LogServices/IML/Entries/"}
	if mid := odataID(mgr); mid != "" {
		paths = append(paths, strings.TrimRight(mid, "/")+"/LogServices/Sel/Entries", strings.TrimRight(mid, "/")+"/LogServices/IEL/Entries")
	}
	paths = append(paths, strings.TrimRight(sysPath, "/")+"/LogServices/Log1/Entries")
	out := []map[string]any{}
	for _, p := range paths {
		c := r.try(p)
		members := ja(c["Members"])
		if len(members) == 0 {
			continue
		}
		if len(members) > 50 {
			// iLO lista do mais antigo para o mais novo; iDRAC do mais novo para o mais antigo.
			if strings.Contains(p, "IML") || strings.Contains(p, "Log1") {
				members = members[len(members)-50:]
			} else {
				members = members[:50]
			}
		}
		for _, e := range members {
			em := jm(e)
			if js(em["Message"]) == "" && odataID(em) != "" {
				if full := r.try(odataID(em)); full != nil {
					em = full
				}
			}
			sev := strings.ToLower(firstNonEmpty(js(em["Severity"]), js(oemHP(em)["Severity"])))
			level := "info"
			if strings.Contains(sev, "critical") || strings.Contains(sev, "fatal") {
				level = "critical"
			} else if strings.Contains(sev, "warning") || strings.Contains(sev, "caution") {
				level = "warning"
			}
			// Mesmo formato dos coletores antigos: evita reenviar eventos já vistos.
			key := firstNonEmpty(js(em["Id"]), odataID(em), js(em["Created"]))
			out = append(out, map[string]any{
				"event_key": key, "severity": level, "category": nilIfEmpty(firstNonEmpty(js(em["EntryType"]), js(oemHP(em)["Class"]))),
				"message":     firstNonEmpty(js(em["Message"]), js(em["Name"]), "Evento de hardware"),
				"recorded_at": firstNonEmpty(js(em["Created"]), time.Now().UTC().Format(time.RFC3339)),
			})
		}
		break
	}
	return out
}
