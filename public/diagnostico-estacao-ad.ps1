# =====================================================================
#  Diagnostico de Estacao do Dominio - FM TechFlow
#  Resolve/Previne:
#   - "Falha na relacao de confianca entre esta estacao e o dominio primario"
#   - "Ha uma diferenca de horario e/ou data entre o cliente e o servidor"
#   - "H:\Pasta nao esta acessivel / nao e possivel alcancar o local da rede"
#  Execute como Administrador LOCAL:
#     powershell -ExecutionPolicy Bypass -File diagnostico-estacao-ad.ps1 -Corrigir
#  Se o usuario nao consegue logar: entre com o administrador LOCAL (.\Administrador)
#  ou desconecte o cabo de rede, logue com a conta em cache e execute o script.
# =====================================================================
#  Teste de velocidade com servidores: -Servidores 192.168.0.10,192.168.0.20
#  (sem o parametro, o script pergunta; use -NaoPerguntar para pular)
param([switch]$Corrigir, [string[]]$Servidores = @(), [switch]$NaoPerguntar)

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

$cs = Get-WmiObject Win32_ComputerSystem
$dominio = $cs.Domain
Write-Host "=== Diagnostico da estacao $env:COMPUTERNAME ($dominio) ===" -ForegroundColor Cyan
if (-not $cs.PartOfDomain) {
    Add-Finding "Ingresso no dominio" "error" "Maquina fora do dominio" "Ingresse com: Add-Computer -DomainName <dominio> -Credential <DOMINIO\admin> -Restart"
}

# 1) Localizar controlador de dominio
$dcInfo = nltest /dsgetdc:$dominio 2>&1 | Out-String
$dc = if ($dcInfo -match "DC: \\\\([^\s]+)") { $Matches[1] } else { $null }
if ($dc) { Add-Finding "Controlador de dominio" "ok" "Encontrado: $dc" }
else { Add-Finding "Controlador de dominio" "error" "Nenhum DC localizado" "Verifique se o DNS da placa de rede aponta para o IP do servidor AD (nao para o roteador/8.8.8.8)." }

# 2) DNS da placa de rede
$dnsServers = (Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses }).ServerAddresses | Select-Object -Unique
$publicos = $dnsServers | Where-Object { $_ -match "^(8\.8|8\.4|1\.1|1\.0|208\.67|9\.9)" }
if ($publicos) { Add-Finding "DNS da rede" "error" "DNS publico configurado: $($publicos -join ', ')" "Configure apenas o IP do servidor AD como DNS (via DHCP). DNS publico faz a maquina perder o dominio e as unidades de rede." }
else { Add-Finding "DNS da rede" "ok" ($dnsServers -join ", ") }

# 3) Horario (Kerberos tolera no maximo 5 minutos)
if ($dc) {
    $sc = w32tm /stripchart /computer:$dc /samples:1 /dataonly 2>&1 | Select-String "[+-]\d+[\.,]\d+s"
    if ($sc) {
        $off = [math]::Abs([double](($sc.Matches[0].Value) -replace "s", "" -replace ",", "."))
        if ($off -gt 60) {
            if ($Corrigir) {
                Set-Service W32Time -StartupType Automatic
                w32tm /register 2>&1 | Out-Null
                Start-Service W32Time -ErrorAction SilentlyContinue
                w32tm /config /syncfromflags:domhier /update | Out-Null
                Restart-Service W32Time -ErrorAction SilentlyContinue; w32tm /resync /force | Out-Null
                Add-Finding "Horario x servidor" "fixed" ("Diferenca de {0:N0}s corrigida (sincronizado com o dominio)" -f $off)
            } else { Add-Finding "Horario x servidor" "error" ("Diferenca de {0:N0}s" -f $off) "Rode: w32tm /config /syncfromflags:domhier /update; net stop w32time; net start w32time; w32tm /resync /force. Se a data volta ao desligar, troque a bateria CMOS." }
        } else { Add-Finding "Horario x servidor" "ok" ("{0:N1}s de diferenca" -f $off) }
    } else { Add-Finding "Horario x servidor" "warning" "Nao foi possivel medir" "Verifique a porta UDP 123 entre a estacao e o servidor." }
}
$w32 = Get-Service W32Time -ErrorAction SilentlyContinue
if ($w32 -and ($w32.StartType -eq "Disabled" -or $w32.Status -ne "Running")) {
    if ($Corrigir) {
        try {
            Set-Service W32Time -StartupType Automatic
            w32tm /register 2>&1 | Out-Null
            Start-Service W32Time -ErrorAction Stop
            Add-Finding "Servico de horario" "fixed" "W32Time ativado"
        } catch { Add-Finding "Servico de horario" "error" "Nao foi possivel iniciar o W32Time" "Rode como administrador: Set-Service W32Time -StartupType Automatic; w32tm /register; Start-Service W32Time" }
    }
    else { Add-Finding "Servico de horario" "warning" "W32Time $($w32.Status)/$($w32.StartType)" "Set-Service W32Time -StartupType Automatic; Start-Service W32Time" }
}

# 4) Canal seguro / relacao de confianca
if ($cs.PartOfDomain) {
    if (Test-ComputerSecureChannel) { Add-Finding "Relacao de confianca" "ok" "Canal seguro valido" }
    elseif ($Corrigir) {
        Write-Host "Informe um usuario ADMIN DO DOMINIO para reparar a relacao de confianca:" -ForegroundColor Yellow
        $cred = Get-Credential -Message "DOMINIO\administrador"
        if ($cred -and (Test-ComputerSecureChannel -Repair -Credential $cred)) {
            Add-Finding "Relacao de confianca" "fixed" "Canal seguro reparado sem reiniciar"
        } else {
            Add-Finding "Relacao de confianca" "error" "Reparo falhou" "Rode: Reset-ComputerMachinePassword -Server $dc -Credential DOMINIO\admin. Se falhar, remova do dominio (grupo de trabalho), reinicie e ingresse novamente."
        }
    } else { Add-Finding "Relacao de confianca" "error" "Canal seguro quebrado" "Rode este script com -Corrigir (pede um admin do dominio) ou: Test-ComputerSecureChannel -Repair -Credential DOMINIO\admin" }

    # Senha da conta de maquina
    $pwdAge = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters").DisablePasswordChange
    if ($pwdAge -eq 1) { Add-Finding "Troca de senha da maquina" "warning" "Desativada (DisablePasswordChange=1)" "Reative a troca automatica para evitar dessincronia apos restaurar snapshots." }
}

# 5) Portas do servidor
if ($dc) {
    foreach ($p in @(@{p = 53; n = "DNS" }, @{p = 88; n = "Kerberos" }, @{p = 389; n = "LDAP" }, @{p = 445; n = "SMB (arquivos)" })) {
        $ok = (Test-NetConnection $dc -Port $p.p -WarningAction SilentlyContinue).TcpTestSucceeded
        if ($ok) { Add-Finding "Porta $($p.p) $($p.n)" "ok" "Acessivel em $dc" }
        else { Add-Finding "Porta $($p.p) $($p.n)" "error" "Bloqueada/sem resposta em $dc" "Verifique firewall, antivirus e cabo/Wi-Fi. Sem a porta 445 as unidades de rede ficam inacessiveis." }
    }
}

# 6) Unidades de rede mapeadas (erro 'H:\Contabil nao esta acessivel')
$maps = Get-WmiObject Win32_MappedLogicalDisk
foreach ($m in $maps) {
    if (Test-Path "$($m.Name)\") { Add-Finding "Unidade $($m.Name)" "ok" $m.ProviderName }
    elseif (Test-Path $m.ProviderName) { Add-Finding "Unidade $($m.Name)" "warning" "Caminho $($m.ProviderName) responde, mas a letra esta desconectada" "Rode 'net use $($m.Name) /delete' e faca logoff/logon para remapear." }
    else { Add-Finding "Unidade $($m.Name)" "error" "$($m.ProviderName) inacessivel" "Verifique se a pasta existe no servidor, permissoes do usuario no grupo do setor e a relacao de confianca/horario acima." }
}
foreach ($svc in "LanmanWorkstation", "Netlogon", "Dnscache") {
    $s = Get-Service $svc
    if ($s.Status -ne "Running") {
        if ($Corrigir) { Start-Service $svc; Add-Finding "Servico $svc" "fixed" "Iniciado" }
        else { Add-Finding "Servico $svc" "error" "Parado" "Start-Service $svc" }
    }
}

# 6.1) Conexao e velocidade entre estacao e servidores
$alvos = New-Object System.Collections.ArrayList
if ($dc) { [void]$alvos.Add($dc) }
foreach ($s in $Servidores) { if ($s -and -not $alvos.Contains($s)) { [void]$alvos.Add($s) } }
if (-not $NaoPerguntar) {
    $extra = Read-Host "IP/nome de servidor(es) para testar velocidade (separe por virgula, Enter para pular)"
    foreach ($s in ($extra -split "[,; ]+")) { if ($s -and -not $alvos.Contains($s)) { [void]$alvos.Add($s) } }
}
foreach ($alvo in $alvos) {
    # Latencia e perda
    $pings = @(1..10 | ForEach-Object { Test-Connection $alvo -Count 1 -ErrorAction SilentlyContinue })
    $perda = (10 - $pings.Count) * 10
    if ($pings.Count -eq 0) {
        Add-Finding "Conexao $alvo" "error" "Sem resposta (100% de perda)" "Verifique cabo/Wi-Fi, IP, firewall (ICMP) e se o servidor esta ligado."
        continue
    }
    $lat = ($pings | Measure-Object ResponseTime -Average -Maximum)
    $jit = if ($pings.Count -gt 1) { ($pings | ForEach-Object { $_.ResponseTime } | Measure-Object -Maximum -Minimum) } else { $null }
    $txt = "Latencia media {0:N0} ms (max {1} ms), perda {2}%" -f $lat.Average, $lat.Maximum, $perda
    if ($perda -ge 20 -or $lat.Average -gt 50) { Add-Finding "Conexao $alvo" "error" $txt "Rede instavel: verifique cabo, porta do switch, Wi-Fi fraco ou loop de rede. Em rede local o normal e <5 ms e 0% de perda." }
    elseif ($perda -gt 0 -or $lat.Average -gt 10) { Add-Finding "Conexao $alvo" "warning" $txt "Latencia acima do ideal para rede local. Prefira cabo e verifique o switch." }
    else { Add-Finding "Conexao $alvo" "ok" $txt }

    # Velocidade via SMB (escrita/leitura de arquivo de teste em compartilhamento)
    $share = $null
    # Pasta de teste no compartilhamento administrativo do servidor: \\SERVIDOR\C$\testevel
    $testvel = "\\$alvo\C`$\testevel"
    if (-not (Test-Path $testvel -PathType Container)) { New-Item -ItemType Directory -Path $testvel -Force | Out-Null }
    $destino = $null
    if (Test-Path $testvel -PathType Container) { $destino = $testvel }
    if (-not $destino) {
        foreach ($m in $maps) { if ($m.ProviderName -like "\\$alvo\*" -and (Test-Path "$($m.Name)\")) { $destino = "$($m.Name)\"; break } }
    }
    # Fichier de test de 200 MB genere en local avant l'envoi
    $origem = Join-Path $env:TEMP "fmtf_speed.bin"
    $bytes = New-Object byte[] (200MB); (New-Object Random).NextBytes($bytes)
    [IO.File]::WriteAllBytes($origem, $bytes)
    if ($destino) {
        $dest = Join-Path $destino ("fmtf_speed_{0}.bin" -f $env:COMPUTERNAME)
        $t = Measure-Command { Copy-Item $origem $dest -Force }
        $up = if ($t.TotalSeconds -gt 0) { 1600 / $t.TotalSeconds } else { 0 }
        $t2 = Measure-Command { Copy-Item $dest "$origem.ret" -Force }
        $down = if ($t2.TotalSeconds -gt 0) { 1600 / $t2.TotalSeconds } else { 0 }
        Remove-Item $dest, "$origem.ret" -Force
        $txt = "Envio {0:N0} Mbps / Recebimento {1:N0} Mbps (arquivo 200 MB em {2})" -f $up, $down, $destino
        $min = [math]::Min($up, $down)
        if ($min -lt 50) { Add-Finding "Velocidade $alvo" "error" $txt "Muito lento para rede local. Verifique se a placa negociou 100 Mbps/half-duplex, cabo danificado, Wi-Fi ou switch sobrecarregado." }
        elseif ($min -lt 300) { Add-Finding "Velocidade $alvo" "warning" $txt "Abaixo de rede gigabit. Confira cabo Cat5e/Cat6 e a velocidade negociada da placa." }
        else { Add-Finding "Velocidade $alvo" "ok" $txt }
    } elseif ($share) {
        $arq = Get-ChildItem $share -Recurse -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1
        if ($arq -and $arq.Length -gt 0) {
            $t = Measure-Command { Copy-Item $arq.FullName "$origem.ret" -Force }
            $down = if ($t.TotalSeconds -gt 0) { ($arq.Length * 8 / 1MB) / $t.TotalSeconds } else { 0 }
            Remove-Item "$origem.ret" -Force
            Add-Finding "Velocidade $alvo" ($(if ($down -lt 50) { "warning" } else { "ok" })) ("Recebimento {0:N0} Mbps (leitura de {1:N1} MB do {2})" -f $down, ($arq.Length / 1MB), $share) "Para medir envio, rode como Administrador (acesso a C$) ou mapeie uma unidade de rede gravavel deste servidor."
        } else { Add-Finding "Velocidade $alvo" "warning" "Sem arquivo para medir velocidade" "Rode como Administrador (acesso a C$) ou mapeie uma unidade de rede deste servidor para medir a velocidade." }
    } else { Add-Finding "Velocidade $alvo" "warning" "Nenhum compartilhamento acessivel para medir velocidade" "Rode o script como Administrador para usar a pasta \\SERVIDOR\C`$\testevel, ou verifique a porta 445 e as permissoes." }
    Remove-Item $origem -Force
}
$nic = Get-NetAdapter -Physical | Where-Object Status -eq "Up"
foreach ($n in $nic) {
    $st = if ($n.LinkSpeed -match "^(10|100) Mbps") { "warning" } else { "ok" }
    Add-Finding "Placa $($n.Name)" $st "Link $($n.LinkSpeed) ($($n.InterfaceDescription))" $(if ($st -eq "warning") { "Placa negociou velocidade baixa: troque o cabo/porta do switch." } else { "" })
}

# 7) Limpeza de cache (corrige tickets Kerberos e DNS antigos)
if ($Corrigir) {
    ipconfig /flushdns | Out-Null; ipconfig /registerdns | Out-Null; klist purge | Out-Null
    gpupdate /force /wait:60 | Out-Null
    Add-Finding "Cache DNS/Kerberos/GPO" "fixed" "Caches limpos e politicas reaplicadas"
}

# ---- Envio ----
$payload = @{ scope = "workstation"; hostname = $env:COMPUTERNAME; domain = $dominio; client_id = $CLIENT_ID; findings = $Findings } | ConvertTo-Json -Depth 5
try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/ad-diagnostics-ingest" -Method POST -ContentType "application/json; charset=utf-8" `
        -Headers @{ Authorization = "Bearer $SUPABASE_ANON_KEY"; apikey = $SUPABASE_ANON_KEY } -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
    Write-Host "`nRelatorio enviado ao painel (Servidores > Diagnosticos)." -ForegroundColor Green
} catch { Write-Host "`nSem internet/servidor: relatorio nao enviado ($($_.Exception.Message))." -ForegroundColor Red }
