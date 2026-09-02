<#
.SYNOPSIS
    Instala qualquer coletor/agente desta plataforma como SERVIÇO DO WINDOWS,
    executando a partir da MESMA PASTA onde o arquivo foi extraído.

.DESCRIPTION
    O script detecta automaticamente o coletor presente na pasta atual
    (proxmox-collector.js, ilo-collector.js, vmware-collector.js,
    dvr-vps-collector.js, mikrotik-vps-collector.js, local-backup.js,
    cloud-backup.js ou windows-server-collector.ps1) ou aceita o nome via -Script.

    Estratégia de instalação (nesta ordem):
      1. NSSM (Non-Sucking Service Manager) - baixado automaticamente se ausente.
         Gera um serviço real, com reinício automático e logs em .\logs\.
      2. Fallback: Tarefa Agendada executada no boot com a conta SYSTEM,
         caso o download do NSSM não seja possível (rede restrita).

    O diretório de trabalho do serviço é SEMPRE a pasta onde este script está,
    garantindo que .env, tokens e logs fiquem junto do agente.

.PARAMETER Script
    Nome do arquivo do coletor (opcional - detectado automaticamente).

.PARAMETER Nome
    Nome do serviço no Windows. Padrão: derivado do nome do coletor.

.PARAMETER Url
    URL do backend (repassada ao coletor como --url).

.PARAMETER Key
    Chave anônima do backend (repassada ao coletor como --key).

.PARAMETER Intervalo
    Intervalo de coleta em segundos. Padrão: 300.

.PARAMETER Argumentos
    Argumentos extras livres, anexados ao final da linha de comando.

.PARAMETER Desinstalar
    Remove o serviço (ou a tarefa agendada) previamente instalado.

.EXAMPLE
    .\instalar-agente-servico.ps1 -Url "https://xxx.supabase.co" -Key "ANON_KEY"

.EXAMPLE
    .\instalar-agente-servico.ps1 -Script ilo-collector.js -Nome "ColetorILO" -Url "..." -Key "..."

.EXAMPLE
    .\instalar-agente-servico.ps1 -Desinstalar
#>

[CmdletBinding()]
param(
    [string] $Script,
    [string] $Nome,
    [string] $Url,
    [string] $Key,
    [int]    $Intervalo = 300,
    [string] $Argumentos = "",
    [switch] $Desinstalar
)

$ErrorActionPreference = "Stop"

# --------------------------------------------------------------- utilidades
function Write-Passo  ([string] $m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok     ([string] $m) { Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Aviso  ([string] $m) { Write-Host "    [!]  $m" -ForegroundColor Yellow }
function Write-Erro   ([string] $m) { Write-Host "    [X]  $m" -ForegroundColor Red }

# Exige elevação: criar serviços/tarefas SYSTEM requer administrador.
$identidade = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Erro "Execute este script como Administrador (botão direito > Executar como administrador)."
    exit 1
}

# A pasta do próprio script é o diretório de trabalho do serviço.
$Pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Pasta
Write-Passo "Pasta de instalação: $Pasta"

# ------------------------------------------------- detecção do coletor alvo
$CANDIDATOS = @(
    "proxmox-collector.js",
    "ilo-collector.js",
    "vmware-collector.js",
    "dvr-vps-collector.js",
    "mikrotik-vps-collector.js",
    "local-backup.js",
    "cloud-backup.js",
    "windows-server-collector.ps1",
    "windows-server-agent.ps1"
)

if (-not $Script) {
    foreach ($c in $CANDIDATOS) {
        if (Test-Path (Join-Path $Pasta $c)) { $Script = $c; break }
    }
}

if (-not $Script) {
    Write-Erro "Nenhum coletor encontrado nesta pasta. Extraia o agente aqui ou use -Script <arquivo>."
    exit 1
}

$CaminhoScript = Join-Path $Pasta $Script
if (-not (Test-Path $CaminhoScript)) {
    Write-Erro "Arquivo não encontrado: $CaminhoScript"
    exit 1
}

if (-not $Nome) {
    $base = [IO.Path]::GetFileNameWithoutExtension($Script) -replace "[^A-Za-z0-9]", ""
    $Nome = "Agente_$base"
}
Write-Ok "Coletor: $Script"
Write-Ok "Serviço: $Nome"

# Coletores de infraestrutura precisam destas credenciais para permanecerem
# em execução. Sem elas, o Node.js encerra imediatamente e o Windows informa
# apenas que o serviço falhou ao iniciar.
$COLETORES_BACKEND = @(
    "proxmox-collector.js",
    "ilo-collector.js",
    "vmware-collector.js",
    "mikrotik-vps-collector.js"
)
$requerBackend = $COLETORES_BACKEND -contains $Script.ToLower()

if (-not $Desinstalar -and $requerBackend) {
    if (-not $Url) {
        $Url = Read-Host "Informe a URL do backend"
    }
    if (-not $Key) {
        $chaveProtegida = Read-Host "Informe a chave publica do backend" -AsSecureString
        $ponteiroChave = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($chaveProtegida)
        try {
            $Key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroChave)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroChave)
        }
    }
    if ([string]::IsNullOrWhiteSpace($Url) -or [string]::IsNullOrWhiteSpace($Key)) {
        Write-Erro "URL e chave sao obrigatorias para o coletor $Script. Nada foi instalado."
        Write-Host "    Exemplo: .\instalar-agente-servico.ps1 -Url `"https://...`" -Key `"...`""
        exit 1
    }
}

# ---------------------------------------------------------- desinstalação
if ($Desinstalar) {
    Write-Passo "Removendo instalação anterior"
    $svc = Get-Service -Name $Nome -ErrorAction SilentlyContinue
    if ($svc) {
        if ($svc.Status -ne "Stopped") { Stop-Service -Name $Nome -Force -ErrorAction SilentlyContinue }
        $nssm = Join-Path $Pasta "nssm.exe"
        if (Test-Path $nssm) { & $nssm remove $Nome confirm | Out-Null } else { sc.exe delete $Nome | Out-Null }
        Write-Ok "Serviço '$Nome' removido."
    } else {
        Write-Aviso "Serviço '$Nome' não encontrado."
    }
    if (Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
        Write-Ok "Tarefa agendada '$Nome' removida."
    }
    exit 0
}

# ------------------------------------------------- executável e argumentos
$ehNode = $Script.ToLower().EndsWith(".js")

if ($ehNode) {
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue)
    if (-not $node) {
        Write-Erro "Node.js não encontrado no PATH. Instale em https://nodejs.org (LTS) e execute novamente."
        exit 1
    }
    $Executavel = $node.Source
    $linha = "`"$CaminhoScript`""
    if ($Url)        { $linha += " --url `"$Url`"" }
    if ($Key)        { $linha += " --key `"$Key`"" }
    if ($Intervalo)  { $linha += " --intervalo $Intervalo" }
    if ($Argumentos) { $linha += " $Argumentos" }
    Write-Ok "Runtime: $Executavel"
} else {
    $Executavel = (Get-Command powershell.exe).Source
    $linha = "-NoProfile -ExecutionPolicy Bypass -File `"$CaminhoScript`""
    if ($Url)        { $linha += " -SupabaseUrl `"$Url`"" }
    if ($Key)        { $linha += " -SupabaseKey `"$Key`"" }
    if ($Argumentos) { $linha += " $Argumentos" }
    Write-Ok "Runtime: PowerShell"
}

$PastaLogs = Join-Path $Pasta "logs"
if (-not (Test-Path $PastaLogs)) { New-Item -ItemType Directory -Path $PastaLogs | Out-Null }

# ---------------------------------------------------------------- NSSM
$Nssm = Join-Path $Pasta "nssm.exe"

function Obter-Nssm {
    if (Test-Path $Nssm) { return $true }
    Write-Passo "Baixando o NSSM (gerenciador de serviços)"
    $zip  = Join-Path $env:TEMP "nssm.zip"
    $dest = Join-Path $env:TEMP ("nssm_" + [Guid]::NewGuid().ToString("N"))
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 60
        Expand-Archive -Path $zip -DestinationPath $dest -Force
        $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
        $exe  = Get-ChildItem -Path $dest -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -match $arch } | Select-Object -First 1
        if (-not $exe) { throw "nssm.exe não encontrado no pacote." }
        Copy-Item $exe.FullName $Nssm -Force
        Write-Ok "NSSM instalado em $Nssm"
        return $true
    } catch {
        Write-Aviso "Falha ao obter o NSSM: $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item $zip -ErrorAction SilentlyContinue
        Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Instalar-ComNssm {
    Write-Passo "Instalando o serviço via NSSM"
    $svc = Get-Service -Name $Nome -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Aviso "Serviço já existe - recriando."
        if ($svc.Status -ne "Stopped") { Stop-Service -Name $Nome -Force -ErrorAction SilentlyContinue }
        & $Nssm remove $Nome confirm | Out-Null
        Start-Sleep -Seconds 2
    }

    # Registra primeiro apenas o executavel e grava os parametros separadamente.
    # Isso evita que o NSSM duplique aspas em caminhos e argumentos extensos.
    & $Nssm install $Nome $Executavel | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "O NSSM nao conseguiu registrar o servico (codigo $LASTEXITCODE)." }
    & $Nssm set $Nome AppParameters $linha | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "O NSSM nao conseguiu configurar os argumentos (codigo $LASTEXITCODE)." }
    & $Nssm set $Nome AppDirectory      $Pasta                                   | Out-Null
    & $Nssm set $Nome DisplayName       "Coletor - $Script"                      | Out-Null
    & $Nssm set $Nome Description       "Agente coletor executando em $Pasta"    | Out-Null
    & $Nssm set $Nome Start             SERVICE_AUTO_START                       | Out-Null
    & $Nssm set $Nome AppStdout         (Join-Path $PastaLogs "servico.log")     | Out-Null
    & $Nssm set $Nome AppStderr         (Join-Path $PastaLogs "servico-erro.log")| Out-Null
    & $Nssm set $Nome AppRotateFiles    1                                        | Out-Null
    & $Nssm set $Nome AppRotateBytes    10485760                                 | Out-Null
    & $Nssm set $Nome AppExit Default   Restart                                  | Out-Null
    & $Nssm set $Nome AppRestartDelay   10000                                    | Out-Null

    try {
        Start-Service -Name $Nome
        Start-Sleep -Seconds 4
    } catch {
        $logErro = Join-Path $PastaLogs "servico-erro.log"
        $detalhe = $_.Exception.Message
        if (Test-Path $logErro) {
            $ultimasLinhas = Get-Content $logErro -Tail 12 -ErrorAction SilentlyContinue
            if ($ultimasLinhas) { $detalhe += "`n`nUltimas linhas do log:`n" + ($ultimasLinhas -join "`n") }
        }
        throw "Falha ao iniciar o servico. $detalhe`nConsulte: $logErro"
    }

    $estado = (Get-Service -Name $Nome).Status
    if ($estado -ne "Running") {
        $logErro = Join-Path $PastaLogs "servico-erro.log"
        $ultimasLinhas = if (Test-Path $logErro) { Get-Content $logErro -Tail 12 -ErrorAction SilentlyContinue } else { @() }
        $detalheLog = if ($ultimasLinhas) { "`n" + ($ultimasLinhas -join "`n") } else { "" }
        throw "O servico encerrou logo apos iniciar. Verifique URL, chave e conectividade. Log: $logErro$detalheLog"
    }
    Write-Ok "Serviço '$Nome' instalado e $estado."
    return $true
}

function Instalar-ComTarefa {
    Write-Passo "Instalando via Tarefa Agendada (fallback sem NSSM)"
    if (Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
    }
    $acao     = New-ScheduledTaskAction -Execute $Executavel -Argument $linha -WorkingDirectory $Pasta
    $gatilho  = New-ScheduledTaskTrigger -AtStartup
    $conta    = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $opcoes   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                                             -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
                                             -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilho -Principal $conta -Settings $opcoes | Out-Null
    Start-ScheduledTask -TaskName $Nome
    Write-Ok "Tarefa agendada '$Nome' criada e iniciada (executa no boot como SYSTEM)."
    return $true
}

# ------------------------------------------------------------------ execução
try {
    $instalado = $false
    if (Obter-Nssm) { $instalado = Instalar-ComNssm }
    if (-not $instalado) { $instalado = Instalar-ComTarefa }

    Write-Passo "Concluído"
    Write-Host "    Pasta de trabalho : $Pasta"
    Write-Host "    Logs              : $PastaLogs"
    Write-Host "    Status            : Get-Service $Nome"
    Write-Host "    Parar / Iniciar   : Stop-Service $Nome  |  Start-Service $Nome"
    Write-Host "    Desinstalar       : .\instalar-agente-servico.ps1 -Desinstalar -Nome $Nome"
} catch {
    Write-Erro $_.Exception.Message
    exit 1
}
