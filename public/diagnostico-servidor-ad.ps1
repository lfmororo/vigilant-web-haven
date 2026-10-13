# =====================================================================
#  Diagnostico do Servidor / Active Directory - FM TechFlow
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
    $s = Get-Service -Name $svc
    if (-not $s) { continue }
    if ($s.Status -eq "Running") { Add-Finding "Servico $svc" "ok" "Em execucao" }
    elseif ($Corrigir) {
        Start-Service $svc; Start-Sleep 3
        if ((Get-Service $svc).Status -eq "Running") { Add-Finding "Servico $svc" "fixed" "Estava parado e foi iniciado" }
        else { Add-Finding "Servico $svc" "error" "Nao foi possivel iniciar" "Verifique o Visualizador de Eventos (Sistema) e dependencias do servico." }
    } else { Add-Finding "Servico $svc" "error" "Status: $($s.Status)" "Inicie o servico: Start-Service $svc (ou rode com -Corrigir)." }
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

# ---- Envio e relatorio ----
$payload = @{ scope = "server"; hostname = $env:COMPUTERNAME; domain = $dominio; client_id = $CLIENT_ID; findings = $Findings } | ConvertTo-Json -Depth 5
try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/ad-diagnostics-ingest" -Method POST -ContentType "application/json; charset=utf-8" `
        -Headers @{ Authorization = "Bearer $SUPABASE_ANON_KEY"; apikey = $SUPABASE_ANON_KEY } -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
    Write-Host "`nRelatorio enviado ao painel (Servidores > Diagnosticos)." -ForegroundColor Green
} catch { Write-Host "`nFalha ao enviar relatorio: $($_.Exception.Message)" -ForegroundColor Red }
