# Agente de provisionamento de usuarios (Active Directory + pastas)
# Executar em um controlador de dominio, com o modulo ActiveDirectory disponivel.
#
# Uso:
#   .\ad-provisioning-agent.ps1 -Url "https://SEU-BACKEND/functions/v1/provisioning-agent" -Key "CHAVE" -ClientId "UUID" [-Intervalo 30]

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string]$ClientId,
    [int]$Intervalo = 30
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.3.0"

function Write-Log {
    param([string]$Mensagem)
    $linha = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Mensagem
    Write-Host $linha
    try {
        $pasta = Join-Path $PSScriptRoot "logs"
        if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
        Add-Content -Path (Join-Path $pasta "provisionamento.log") -Value $linha -Encoding UTF8
    } catch { }
}

function Invoke-Backend {
    param([hashtable]$Corpo)
    $headers = @{ "x-agent-key" = $Key }
    $json = $Corpo | ConvertTo-Json -Depth 8
    $corpoUtf8 = [Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri $Url -Method Post -Headers $headers -Body $corpoUtf8 `
        -ContentType "application/json; charset=utf-8" -TimeoutSec 60
}

function Ensure-Modulo {
    if (-not (Get-Module -ListAvailable -Name ActiveDirectory)) {
        throw "Modulo ActiveDirectory nao encontrado. Instale as RSAT/AD DS neste servidor."
    }
    Import-Module ActiveDirectory -ErrorAction Stop
}

function Get-ControladorDominio {
    $dominio = Get-ADDomain -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($dominio.PDCEmulator)) {
        throw "Nao foi possivel localizar o controlador principal do dominio."
    }
    return $dominio.PDCEmulator
}

function Find-UsuarioAD {
    param(
        [Parameter(Mandatory = $true)][string]$Login,
        [Parameter(Mandatory = $true)][string]$Servidor
    )

    # Get-ADUser -Identity pode resolver o nome em outro controlador e gerar
    # "objeto com identidade nao localizado" logo apos a criacao. A consulta
    # por filtro e feita explicitamente no mesmo DC usado pelo New-ADUser.
    $loginEscapado = $Login.Replace("'", "''")
    $usuarios = @(Get-ADUser -Filter "SamAccountName -eq '$loginEscapado'" -Server $Servidor `
        -Properties DistinguishedName, SID -ErrorAction Stop)
    if ($usuarios.Count -gt 1) {
        throw "Mais de um usuario foi localizado para o login '$Login' no controlador $Servidor."
    }
    return $usuarios | Select-Object -First 1
}

function Wait-UsuarioAD {
    param(
        [Parameter(Mandatory = $true)][string]$Login,
        [Parameter(Mandatory = $true)][string]$Servidor,
        [int]$Tentativas = 10
    )

    for ($tentativa = 1; $tentativa -le $Tentativas; $tentativa++) {
        $usuario = Find-UsuarioAD -Login $Login -Servidor $Servidor
        if ($usuario) { return $usuario }
        if ($tentativa -lt $Tentativas) { Start-Sleep -Seconds 2 }
    }

    throw "O usuario '$Login' foi criado, mas ainda nao esta disponivel no controlador $Servidor."
}

function New-UsuarioAD {
    param(
        $Tarefa,
        [System.Collections.ArrayList]$Etapas,
        [Parameter(Mandatory = $true)][string]$Servidor
    )

    $login = $Tarefa.username
    if ($login -notmatch '^[a-zA-Z0-9._-]{2,64}$') {
        throw "Login invalido. Use somente letras, numeros, ponto, hifen e sublinhado."
    }
    $nome = $Tarefa.full_name
    $modelo = $Tarefa.template

    $existente = Find-UsuarioAD -Login $login -Servidor $Servidor
    if ($existente) {
        $usuario = $existente
        [void]$Etapas.Add(@{ etapa = "Usuario no AD"; status = "ok"; detalhe = "Ja existia" })
    }
    else {
        if (-not $Tarefa.password) { throw "Senha inicial nao recebida para $login." }
        $senha = ConvertTo-SecureString $Tarefa.password -AsPlainText -Force
        $parametros = @{
            Name                  = $nome
            SamAccountName        = $login
            UserPrincipalName     = $(if ($Tarefa.email) { $Tarefa.email } else { $login })
            GivenName             = ($nome -split " ")[0]
            DisplayName           = $nome
            EmailAddress          = $Tarefa.email
            AccountPassword       = $senha
            Enabled               = $true
            ChangePasswordAtLogon = $true
        }
        if ($Tarefa.job_title) { $parametros["Title"] = $Tarefa.job_title }
        if ($Tarefa.phone) { $parametros["OfficePhone"] = $Tarefa.phone }
        if ($modelo -and $modelo.ad_ou) { $parametros["Path"] = $modelo.ad_ou }

        New-ADUser @parametros -Server $Servidor
        $usuario = Wait-UsuarioAD -Login $login -Servidor $Servidor
        [void]$Etapas.Add(@{ etapa = "Usuario no AD"; status = "ok"; detalhe = "Criado" })
    }

    if ($modelo -and $modelo.ad_groups) {
        foreach ($grupo in $modelo.ad_groups) {
            if ([string]::IsNullOrWhiteSpace($grupo)) { continue }
            try {
                Add-ADGroupMember -Identity $grupo -Members $usuario.DistinguishedName -Server $Servidor -ErrorAction Stop
                [void]$Etapas.Add(@{ etapa = "Grupo $grupo"; status = "ok"; detalhe = "Adicionado" })
            }
            catch {
                [void]$Etapas.Add(@{ etapa = "Grupo $grupo"; status = "erro"; detalhe = $_.Exception.Message })
            }
        }
    }

    return $usuario
}

function New-PastasUsuario {
    param(
        $Tarefa,
        [System.Collections.ArrayList]$Etapas,
        $UsuarioAD,
        [Parameter(Mandatory = $true)][string]$Servidor
    )

    $modelo = $Tarefa.template
    if ($Tarefa.username -notmatch '^[a-zA-Z0-9._-]{2,64}$') {
        throw "Login invalido para criacao de pastas."
    }
    if (-not $modelo -or [string]::IsNullOrWhiteSpace($modelo.base_path)) {
        [void]$Etapas.Add(@{ etapa = "Pastas"; status = "ignorado"; detalhe = "Sem caminho base no modelo" })
        return
    }

    $raiz = Join-Path $modelo.base_path $Tarefa.username
    if (-not (Test-Path $raiz)) { New-Item -ItemType Directory -Path $raiz -Force | Out-Null }

    foreach ($sub in $modelo.subfolders) {
        if ([string]::IsNullOrWhiteSpace($sub)) { continue }
        $caminho = Join-Path $raiz $sub
        if (-not (Test-Path $caminho)) { New-Item -ItemType Directory -Path $caminho -Force | Out-Null }
    }

    try {
        if (-not $UsuarioAD.SID) {
            throw "O Active Directory nao retornou o SID do usuario $($Tarefa.username)."
        }
        $acl = Get-Acl $raiz
        $regra = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $UsuarioAD.SID, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.AddAccessRule($regra)
        Set-Acl -Path $raiz -AclObject $acl
        [void]$Etapas.Add(@{ etapa = "Pastas"; status = "ok"; detalhe = $raiz })
    }
    catch {
        [void]$Etapas.Add(@{ etapa = "Permissao das pastas"; status = "erro"; detalhe = $_.Exception.Message })
    }

    if ($modelo.home_drive) {
        try {
            Set-ADUser -Identity $UsuarioAD.DistinguishedName -Server $Servidor -HomeDrive $modelo.home_drive -HomeDirectory $raiz
            [void]$Etapas.Add(@{ etapa = "Unidade de rede"; status = "ok"; detalhe = "$($modelo.home_drive) -> $raiz" })
        }
        catch {
            [void]$Etapas.Add(@{ etapa = "Unidade de rede"; status = "erro"; detalhe = $_.Exception.Message })
        }
    }
}

Ensure-Modulo
Write-Log "Agente de provisionamento v$AgentVersion iniciado. Consultando a cada $Intervalo s."

while ($true) {
    try {
        $resposta = Invoke-Backend @{ action = "claim"; host = $env:COMPUTERNAME; version = $AgentVersion; client_id = $ClientId }
        foreach ($tarefa in @($resposta.tasks)) {
            if (-not $tarefa) { continue }
            Write-Log "Processando $($tarefa.username)"
            $etapas = New-Object System.Collections.ArrayList
            $status = "done"
            $erro = ""

            try {
                $servidorAD = Get-ControladorDominio
                $usuarioAD = New-UsuarioAD -Tarefa $tarefa -Etapas $etapas -Servidor $servidorAD
                New-PastasUsuario -Tarefa $tarefa -Etapas $etapas -UsuarioAD $usuarioAD -Servidor $servidorAD
            }
            catch {
                $erro = $_.Exception.Message
                $status = "error"
                [void]$etapas.Add(@{ etapa = "Execucao"; status = "erro"; detalhe = $erro })
            }

            if ($status -eq "done" -and ($etapas | Where-Object { $_.status -eq "erro" })) {
                $status = "partial"
            }

            Invoke-Backend @{
                action     = "report"
                request_id = $tarefa.id
                client_id  = $ClientId
                status     = $status
                steps      = @($etapas)
                log        = ($etapas | ForEach-Object { "$($_.etapa): $($_.status) - $($_.detalhe)" }) -join "`n"
                temporary_password = $(if ($status -eq "done") { $tarefa.password } else { $null })
            } | Out-Null

            $tarefa.password = $null

            Write-Log "Concluido $($tarefa.username) => $status"
        }
    }
    catch {
        Write-Log "Falha no ciclo: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $Intervalo
}
