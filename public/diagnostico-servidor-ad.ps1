# =====================================================================
#  Diagnostico do Servidor / Active Directory - Mororo.tech
#  Execute como Administrador do Dominio NO CONTROLADOR DE DOMINIO:
#     powershell -ExecutionPolicy Bypass -File diagnostico-servidor-ad.ps1
#  Opcional: -Corrigir  (aplica correcoes seguras: horario, servicos, DNS)
# =====================================================================
param([switch]$Corrigir)

$SUPABASE_URL = "__SUPABASE_URL__"
$SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__"
$CLIENT_ID = "__CLIENT_ID__"

$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Findings = New-Object System.Collections.ArrayList

function Add-Finding($check, $status, $detail, $solution = "") {
    [void]$Findings.Add([ordered]@{ check = $check; status = $status; detail = $detail; solution = $solution })
    $cor = @{ ok = "Green"; warning = "Yellow"; error = "Red"; fixed = "Cyan" }[$status]
    Write-Host ("[{0}] {1} - {2}" -f $status.ToUpper(), $check, $detail) -ForegroundColor $cor
}

Import-Module ActiveDirectory -ErrorAction SilentlyContinue
$dominio = (Get-WmiObject Win32_ComputerSystem).Domain
Write-Host "=== Diagnostico do servidor $env:COMPUTERNAME ($dominio) ===" -ForegroundColor Cyan

# 1) Servicos essenciais do AD
foreach ($svc in "NTDS", "DNS", "Netlogon", "kdc", "W32Time", "DFSR", "LanmanServer") {
    $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if (-not $s) { continue }
    if ($s.Status -eq "Running") { Add-Finding "Servico $svc" "ok" "Em execucao" }
    elseif ($Corrigir) {
        try {
            # Servico desabilitado nao inicia: reabilita antes. W32Time pode estar desregistrado.
            if ($s.StartType -eq "Disabled") { Set-Service $svc -StartupType Automatic }
            if ($svc -eq "W32Time") { w32tm /register 2>&1 | Out-Null }
            Start-Service $svc -ErrorAction Stop; Start-Sleep 3
        } catch { }
        if ((Get-Service $svc).Status -eq "Running") { Add-Finding "Servico $svc" "fixed" "Estava parado e foi iniciado" }
        else { Add-Finding "Servico $svc" "error" "Nao foi possivel iniciar" "Rode como administrador: Set-Service $svc -StartupType Automatic; Start-Service $svc. Se falhar, veja o Visualizador de Eventos (Sistema)." }
    } else { Add-Finding "Servico $svc" "error" "Status: $($s.Status)/$($s.StartType)" "Rode como administrador: Set-Service $svc -StartupType Automatic; Start-Service $svc (ou rode o script com -Corrigir)." }
}

# 2) DCDIAG
$dcdiag = dcdiag /q 2>&1 | Out-String
if ([string]::IsNullOrWhiteSpace($dcdiag)) { Add-Finding "DCDIAG" "ok" "Todos os testes passaram" }
else {
    $resumo = ($dcdiag -split "`n" | Where-Object { $_ -match "falhou|failed" } | Select-Object -First 8) -join " | "
    Add-Finding "DCDIAG" "error" ("Falhas: " + $resumo) "Execute 'dcdiag /v' e corrija os testes listados (DNS, replicacao, SYSVOL). Falhas de DNS: 'dcdiag /test:dns /fix' e 'ipconfig /registerdns'."
}

# 3) Replicacao
$repl = repadmin /replsummary 2>&1 | Out-String
if ($repl -match "\s(\d+)\s*/\s*(\d+)\s" -and $repl -match "erro|error|fail") {
    Add-Finding "Replicacao AD" "error" "repadmin reportou falhas" "Rode 'repadmin /showrepl' e 'repadmin /syncall /AdeP'. Verifique conectividade e horario entre DCs."
} else { Add-Finding "Replicacao AD" "ok" "Sem falhas no resumo (ou DC unico)" }

# 4) SYSVOL / NETLOGON
$shares = net share | Out-String
if ($shares -match "SYSVOL" -and $shares -match "NETLOGON") { Add-Finding "Compartilhamentos SYSVOL/NETLOGON" "ok" "Publicados" }
else { Add-Finding "Compartilhamentos SYSVOL/NETLOGON" "error" "Ausentes" "Verifique o servico DFSR/NTFRS e o registro SysvolReady (HKLM\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters = 1)." }

# 5) Horario (causa do erro 'diferenca de horario entre cliente e servidor')
$fonte = (w32tm /query /source 2>&1 | Out-String).Trim()
$pdc = try { (Get-ADDomain).PDCEmulator } catch { "" }
$ehPdc = $pdc -and ($pdc -like "$env:COMPUTERNAME*")
if ($ehPdc -and ($fonte -match "Local CMOS|Free-running")) {
    if ($Corrigir) {
        w32tm /config /manualpeerlist:"a.st1.ntp.br b.st1.ntp.br pool.ntp.br" /syncfromflags:manual /reliable:yes /update | Out-Null
        Restart-Service W32Time; w32tm /resync /force | Out-Null
        Add-Finding "Fonte de horario (PDC)" "fixed" "Configurado NTP.br como fonte externa"
    } else {
        Add-Finding "Fonte de horario (PDC)" "error" "PDC usa relogio local ($fonte)" "No PDC: w32tm /config /manualpeerlist:""a.st1.ntp.br b.st1.ntp.br"" /syncfromflags:manual /reliable:yes /update; Restart-Service W32Time; w32tm /resync"
    }
} else { Add-Finding "Fonte de horario" "ok" "Fonte: $fonte" }
$ntp = w32tm /stripchart /computer:a.st1.ntp.br /samples:1 /dataonly 2>&1 | Select-String "[+-]\d+\.\d+s"
if ($ntp) {
    $off = [math]::Abs([double](($ntp.Matches[0].Value) -replace "s", "" -replace ",", "."))
    if ($off -gt 60) { Add-Finding "Diferenca para NTP" "error" ("{0:N0}s de diferenca" -f $off) "Diferencas acima de 5 min quebram o Kerberos. Corrija a fonte de horario do PDC e rode w32tm /resync /force." }
    elseif ($off -gt 5) { Add-Finding "Diferenca para NTP" "warning" ("{0:N1}s de diferenca" -f $off) "Ajuste com w32tm /resync /force." }
    else { Add-Finding "Diferenca para NTP" "ok" ("{0:N1}s" -f $off) }
}

# 6) Registros DNS SRV do dominio
$srv = Resolve-DnsName "_ldap._tcp.dc._msdcs.$dominio" -Type SRV
if ($srv) { Add-Finding "Registros DNS SRV" "ok" "$(@($srv).Count) registro(s) _ldap" }
elseif ($Corrigir) { ipconfig /registerdns | Out-Null; Restart-Service Netlogon; Add-Finding "Registros DNS SRV" "fixed" "Netlogon reiniciado para re-registrar SRV" }
else { Add-Finding "Registros DNS SRV" "error" "SRV _ldap nao encontrado" "Reinicie o Netlogon (Restart-Service Netlogon) e rode 'dcdiag /test:dns'." }

# 7) FSMO
try { $d = Get-ADDomain; $f = Get-ADForest; Add-Finding "Funcoes FSMO" "ok" "PDC: $($d.PDCEmulator) | RID: $($d.RIDMaster) | Schema: $($f.SchemaMaster)" }
catch { Add-Finding "Funcoes FSMO" "warning" "Nao foi possivel ler" "Verifique o modulo ActiveDirectory (RSAT)." }

# 8) Contas de computador antigas (causa de 'falha na relacao de confianca')
try {
    $limite = (Get-Date).AddDays(-60)
    $antigas = Get-ADComputer -Filter { Enabled -eq $true } -Properties PasswordLastSet, LastLogonDate |
        Where-Object { $_.PasswordLastSet -lt $limite }
    if ($antigas.Count -gt 0) {
        $nomes = ($antigas | Select-Object -First 15 | ForEach-Object { $_.Name }) -join ", "
        Add-Finding "Senha de conta de computador" "warning" "$($antigas.Count) maquina(s) sem trocar senha ha +60 dias: $nomes" "Essas maquinas podem perder a relacao de confianca. Rode o diagnostico de estacao nelas (com -Corrigir) ou desative contas inexistentes."
    } else { Add-Finding "Senha de conta de computador" "ok" "Todas atualizadas" }
} catch {}

# 9) Disco
Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $pct = if ($_.Size) { [math]::Round((1 - $_.FreeSpace / $_.Size) * 100, 1) } else { 0 }
    if ($pct -ge 90) { Add-Finding "Disco $($_.DeviceID)" "error" "$pct% em uso" "Libere espaco: o banco do AD (NTDS.dit) e o SYSVOL param com disco cheio." }
    elseif ($pct -ge 80) { Add-Finding "Disco $($_.DeviceID)" "warning" "$pct% em uso" "Planeje limpeza ou expansao." }
    else { Add-Finding "Disco $($_.DeviceID)" "ok" "$pct% em uso" }
}

# 10) Compartilhamentos de arquivos (erro 'H:\pasta nao esta acessivel')
Get-SmbShare | Where-Object { $_.Name -notmatch '\$$' -and $_.Name -notin "SYSVOL", "NETLOGON" } | ForEach-Object {
    if (Test-Path $_.Path) { Add-Finding "Compartilhamento $($_.Name)" "ok" $_.Path }
    else { Add-Finding "Compartilhamento $($_.Name)" "error" "Pasta $($_.Path) nao existe" "Recrie a pasta ou ajuste o compartilhamento - usuarios verao 'local nao disponivel'." }
}

# 11) Eventos criticos nas ultimas 24h
$ev = Get-WinEvent -FilterHashtable @{ LogName = "Directory Service", "DNS Server", "System"; Level = 1, 2; StartTime = (Get-Date).AddHours(-24) } -MaxEvents 200
if ($ev) {
    $top = $ev | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { "ID $($_.Name) ($($_.Count)x)" }
    Add-Finding "Eventos de erro (24h)" "warning" ($top -join ", ") "Pesquise os IDs no Visualizador de Eventos. 5719/5722 = canal seguro; 1311/2042 = replicacao; 4013 = DNS."
} else { Add-Finding "Eventos de erro (24h)" "ok" "Nenhum erro critico" }

# 12) Lentidao - maquina virtual Proxmox (KVM/QEMU)
try {
    $cs = Get-CimInstance Win32_ComputerSystem
    $bios = Get-CimInstance Win32_BIOS
    $isProxmox = ($cs.Manufacturer -match "QEMU|Proxmox") -or ($cs.Model -match "Standard PC|KVM|QEMU") -or ($bios.Manufacturer -match "SeaBIOS|EDK|Proxmox")
    if ($isProxmox) { Add-Finding "Virtualizacao" "ok" "VM Proxmox/KVM detectada ($($cs.Manufacturer) $($cs.Model))" }
    else { Add-Finding "Virtualizacao" "warning" "Nao identificada como Proxmox ($($cs.Manufacturer) $($cs.Model))" "Verificacoes de VM rodarao mesmo assim." }

    # CPU: uso e fila (fila alta com CPU baixa = host sobrecarregado / CPU steal)
    $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 2 -MaxSamples 5).CounterSamples | Measure-Object CookedValue -Average
    $fila = (Get-Counter '\System\Processor Queue Length' -SampleInterval 2 -MaxSamples 5).CounterSamples | Measure-Object CookedValue -Average
    $nucleos = $cs.NumberOfLogicalProcessors
    $cpuPct = [math]::Round($cpu.Average,1); $filaMed = [math]::Round($fila.Average,1)
    if ($cpuPct -ge 85) {
        $topProc = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 | ForEach-Object { $_.ProcessName }
        Add-Finding "CPU da VM" "error" "$cpuPct% em uso ($nucleos vCPU). Maiores: $($topProc -join ', ')" "Aumente vCPUs no Proxmox (Hardware > Processadores) ou investigue os processos listados."
    } elseif ($filaMed -gt ($nucleos * 2)) {
        Add-Finding "Fila de processador" "error" "Fila $filaMed com CPU $cpuPct% ($nucleos vCPU)" "Fila alta com CPU baixa indica host Proxmox sobrecarregado (CPU steal). Verifique o uso de CPU do no no Proxmox, reduza vCPUs superdimensionadas de outras VMs ou migre a VM."
    } else { Add-Finding "CPU da VM" "ok" "$cpuPct% em uso, fila $filaMed ($nucleos vCPU)" }

    # Tipo de CPU (kvm64/qemu64 = sem instrucoes modernas)
    $cpuNome = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
    if ($cpuNome -match "QEMU Virtual CPU|Common KVM|kvm64|qemu64") {
        Add-Finding "Tipo de CPU virtual" "warning" $cpuNome "No Proxmox, mude Hardware > Processadores > Tipo para 'host' (ou x86-64-v2-AES) para habilitar AES/AVX e melhorar o desempenho."
    } else { Add-Finding "Tipo de CPU virtual" "ok" $cpuNome }

    # Memoria e balloon
    $os = Get-CimInstance Win32_OperatingSystem
    $memPct = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
    $memGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $pf = (Get-Counter '\Memory\Pages/sec' -SampleInterval 2 -MaxSamples 3).CounterSamples | Measure-Object CookedValue -Average
    $pfMed = [math]::Round($pf.Average,0)
    if ($memPct -ge 90 -or $pfMed -gt 1000) { Add-Finding "Memoria da VM" "error" "$memPct% de $memGB GB, paginacao $pfMed/s" "Aumente a RAM da VM no Proxmox. Se usar Ballooning, defina memoria minima igual a maxima no controlador de dominio." }
    elseif ($memPct -ge 80) { Add-Finding "Memoria da VM" "warning" "$memPct% de $memGB GB, paginacao $pfMed/s" "Considere aumentar a RAM." }
    else { Add-Finding "Memoria da VM" "ok" "$memPct% de $memGB GB, paginacao $pfMed/s" }
    $balloon = Get-Service BalloonService -ErrorAction SilentlyContinue
    if (-not $balloon) { Add-Finding "Servico Balloon (VirtIO)" "warning" "Nao instalado" "Instale os drivers VirtIO (virtio-win.iso) e o QEMU Guest Agent." }
    elseif ($balloon.Status -ne "Running") { Add-Finding "Servico Balloon (VirtIO)" "warning" "Status $($balloon.Status)" "Inicie: Start-Service BalloonService" }
    else { Add-Finding "Servico Balloon (VirtIO)" "ok" "Em execucao" }

    # QEMU Guest Agent
    $qga = Get-Service QEMU-GA -ErrorAction SilentlyContinue
    if (-not $qga) { Add-Finding "QEMU Guest Agent" "warning" "Nao instalado" "Instale o qemu-ga do virtio-win.iso e ative 'QEMU Guest Agent' nas Opcoes da VM no Proxmox (melhora desligamento, backup e horario)." }
    elseif ($qga.Status -ne "Running") {
        if ($Corrigir) { Set-Service QEMU-GA -StartupType Automatic; Start-Service QEMU-GA -ErrorAction SilentlyContinue; Add-Finding "QEMU Guest Agent" "fixed" "Servico iniciado" }
        else { Add-Finding "QEMU Guest Agent" "warning" "Status $($qga.Status)" "Start-Service QEMU-GA (ou rode com -Corrigir)." }
    } else { Add-Finding "QEMU Guest Agent" "ok" "Em execucao" }

    # Drivers de disco e rede (IDE/SATA/E1000 sao lentos)
    $discos = Get-CimInstance Win32_DiskDrive
    $lentos = $discos | Where-Object { $_.Model -match "QEMU HARDDISK|ATA" -and $_.PNPDeviceID -notmatch "VEN_1AF4" }
    if ($lentos) { Add-Finding "Controlador de disco" "error" "Disco(s) emulado(s) IDE/SATA: $(($lentos | ForEach-Object Model) -join ', ')" "No Proxmox use VirtIO SCSI single + disco SCSI com IO thread, cache 'Write back' (com no-break) ou 'none', e Discard ativo. Instale antes o driver vioscsi do virtio-win." }
    else { Add-Finding "Controlador de disco" "ok" "VirtIO/SCSI" }
    $nics = Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=True"
    $e1000 = $nics | Where-Object { $_.Name -match "Intel.*(PRO/1000|82540|E1000)|Realtek.*8139" }
    if ($e1000) { Add-Finding "Placa de rede virtual" "warning" "Emulada: $(($e1000 | ForEach-Object Name) -join ', ')" "Troque o modelo para VirtIO (paravirtualizado) no Proxmox apos instalar o driver netkvm." }
    else { Add-Finding "Placa de rede virtual" "ok" (($nics | ForEach-Object Name) -join ', ') }

    # Latencia de disco (armazenamento do host lento)
    $lat = (Get-Counter '\PhysicalDisk(_Total)\Avg. Disk sec/Transfer','\PhysicalDisk(_Total)\Current Disk Queue Length' -SampleInterval 2 -MaxSamples 5).CounterSamples
    $latMs = [math]::Round((($lat | Where-Object Path -match 'sec/transfer' | Measure-Object CookedValue -Average).Average) * 1000, 1)
    $filaD = [math]::Round(($lat | Where-Object Path -match 'queue' | Measure-Object CookedValue -Average).Average, 1)
    if ($latMs -gt 50) { Add-Finding "Latencia de disco" "error" "$latMs ms (fila $filaD)" "Armazenamento do Proxmox lento: verifique IO delay do no, uso de HD mecanico/ZFS sem cache, snapshots antigos e backups rodando no horario de uso." }
    elseif ($latMs -gt 20) { Add-Finding "Latencia de disco" "warning" "$latMs ms (fila $filaD)" "Monitore o IO delay no resumo do no Proxmox; prefira SSD e IO thread." }
    else { Add-Finding "Latencia de disco" "ok" "$latMs ms (fila $filaD)" }

    # Plano de energia
    $plano = (powercfg /getactivescheme) -join ""
    if ($plano -notmatch "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c") {
        if ($Corrigir) { powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c; Add-Finding "Plano de energia" "fixed" "Alterado para Alto desempenho" }
        else { Add-Finding "Plano de energia" "warning" "Nao esta em Alto desempenho" "powercfg /setactive SCHEME_MIN (ou rode com -Corrigir)." }
    } else { Add-Finding "Plano de energia" "ok" "Alto desempenho" }

    # Tempo ligado
    $dias = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 0)
    if ($dias -gt 60) { Add-Finding "Tempo ligado" "warning" "$dias dias sem reiniciar" "Agende reinicio para aplicar atualizacoes e liberar memoria." }
    else { Add-Finding "Tempo ligado" "ok" "$dias dia(s)" }
} catch { Add-Finding "Analise de lentidao (VM)" "warning" "Falha ao coletar: $($_.Exception.Message)" "Execute como administrador." }

# ---- Envio e relatorio ----
$payload = @{ scope = "server"; hostname = $env:COMPUTERNAME; domain = $dominio; client_id = $CLIENT_ID; findings = $Findings } | ConvertTo-Json -Depth 5
try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/ad-diagnostics-ingest" -Method POST -ContentType "application/json; charset=utf-8" `
        -Headers @{ Authorization = "Bearer $SUPABASE_ANON_KEY"; apikey = $SUPABASE_ANON_KEY } -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
    Write-Host "`nRelatorio enviado ao painel (Servidores > Diagnosticos)." -ForegroundColor Green
} catch { Write-Host "`nFalha ao enviar relatorio: $($_.Exception.Message)" -ForegroundColor Red }
