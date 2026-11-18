; Mororo.Tech Coletores — instala os coletores avulsos (Node/PowerShell) como serviços do Windows.
;
; Para máquinas novas prefira o Mororo.Tech Agent (faz tudo isso num serviço só).
; Este instalador existe para quem já usa os coletores antigos ou precisa do DVR.
;
; Interativo: escolhe os coletores, informa o token do agente.
; Silencioso: mororo-coletores-setup.exe /S /TOKEN=mt_xxx /COLETORES=proxmox,ilo,sqlserver [/INTERVALO=300]
; Compilar:   makensis -DVERSION=1.0.0 -DURL=https://api.mororo.tech -DANONKEY=<anon> -DSRC=<public> -DOUT=<saída> coletores-setup.nsi

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "Sections.nsh"
!include "x64.nsh"
!include "WordFunc.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef URL
  !define URL "https://api.mororo.tech"
!endif
!ifndef ANONKEY
  !define ANONKEY ""
!endif
!ifndef SRC
  !define SRC "..\..\..\public"
!endif
!ifndef OUT
  !define OUT "mororo-coletores-setup.exe"
!endif
; Pasta com node_modules (ssh2, axios, ping) para os coletores VMware e DVR — gerada pelo build.sh.
!ifndef NODEMODS
  !define NODEMODS "node_modules"
!endif

Name "Mororo.Tech Coletores"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\MororoTech\Coletores"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "Mororo.Tech"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Mororo.Tech Coletores"
VIAddVersionKey /LANG=1046 "CompanyName" "Mororo.Tech"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador dos coletores Mororo.Tech"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "© Mororo.Tech"

!define MUI_ICON "mororo-agent.ico"
!define MUI_UNICON "mororo-agent.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_ABORTWARNING
!define MUI_COMPONENTSPAGE_SMALLDESC

!define MUI_WELCOMEPAGE_TITLE "Mororo.Tech Coletores ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Instala os coletores de monitoramento como serviços do Windows (Proxmox, VMware, iLO, iDRAC, Windows Server, SQL Server e DVR).$\r$\n$\r$\nDica: para máquinas novas, o Mororo.Tech Agent faz o trabalho de todos eles num serviço só.$\r$\n$\r$\nVocê vai precisar do token do agente gerado no painel."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
Page custom TokenPage TokenLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "Os coletores escolhidos estão rodando como serviços. Os equipamentos (Proxmox, iLO, instâncias SQL…) são cadastrados no painel, em Monitor de Servidores."
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Var Token
Var Intervalo
Var Coletores
Var hToken
Var hIntervalo
Var NeedNode

; ----------------------------------------------------------------- utilidades

; Instala um coletor: copia o instalador de serviço e chama-o com os parâmetros.
!macro InstallCollector ID SCRIPT SVC TOKENARG
  SetOutPath "$INSTDIR\${ID}"
  File "${SRC}\instalar-agente-servico.ps1"
  DetailPrint "Criando o serviço ${SVC}…"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\${ID}\instalar-agente-servico.ps1" -Script ${SCRIPT} -Nome "${SVC}" -Url "${URL}" -Key "${ANONKEY}" -Intervalo $Intervalo -Argumentos "${TOKENARG}"'
  Pop $0
  ${If} $0 != "0"
    DetailPrint "Atenção: o serviço ${SVC} terminou com código $0 (veja $INSTDIR\${ID}\logs)."
  ${EndIf}
  WriteRegStr HKLM "Software\MororoTech\Coletores" "${ID}" "${SVC}"
!macroend

!macro UninstallCollector ID
  ReadRegStr $1 HKLM "Software\MororoTech\Coletores" "${ID}"
  ${If} $1 != ""
  ${AndIf} ${FileExists} "$INSTDIR\${ID}\instalar-agente-servico.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\${ID}\instalar-agente-servico.ps1" -Desinstalar -Nome "$1"'
  ${EndIf}
  RMDir /r "$INSTDIR\${ID}"
  DeleteRegValue HKLM "Software\MororoTech\Coletores" "${ID}"
!macroend

; ----------------------------------------------------------------- seções

Section "-Base" SecBase
  SetRegView 64
  SetOutPath "$INSTDIR"
  File "mororo-agent.ico"
  WriteUninstaller "$INSTDIR\desinstalar.exe"
  StrCpy $NeedNode "0"
SectionEnd

SectionGroup /e "Coletores (Node.js)" GrpNode
  Section /o "Proxmox VE" SecProxmox
    SetOutPath "$INSTDIR\proxmox"
    File "${SRC}\proxmox-collector.js"
    StrCpy $NeedNode "1"
  SectionEnd
  Section /o "VMware ESXi" SecVmware
    SetOutPath "$INSTDIR\vmware"
    File "${SRC}\vmware-collector.js"
    StrCpy $NeedNode "1"
  SectionEnd
  Section /o "HP iLO" SecIlo
    SetOutPath "$INSTDIR\ilo"
    File "${SRC}\ilo-collector.js"
    StrCpy $NeedNode "1"
  SectionEnd
  Section /o "Dell iDRAC" SecIdrac
    SetOutPath "$INSTDIR\idrac"
    File "${SRC}\idrac-collector.js"
    StrCpy $NeedNode "1"
  SectionEnd
  Section /o "DVR Intelbras" SecDvr
    SetOutPath "$INSTDIR\dvr"
    File "${SRC}\dvr-vps-collector.js"
    StrCpy $NeedNode "1"
  SectionEnd
SectionGroupEnd

SectionGroup /e "Coletores (PowerShell)" GrpPs
  Section /o "Windows Server (remoto, WinRM)" SecWindows
    SetOutPath "$INSTDIR\windows"
    File "${SRC}\windows-server-collector.ps1"
  SectionEnd
  Section /o "SQL Server" SecSql
    SetOutPath "$INSTDIR\sqlserver"
    File "${SRC}\sqlserver-collector.ps1"
  SectionEnd
SectionGroupEnd

; Node.js portátil (baixado na instalação, só se algum coletor Node foi escolhido e não houver Node no PATH).
Section "-Node" SecNodeRuntime
  ${If} ${SectionIsSelected} ${SecVmware}
  ${OrIf} ${SectionIsSelected} ${SecDvr}
    DetailPrint "Copiando as dependências (ssh2, axios, ping)…"
    SetOutPath "$INSTDIR\node_modules"
    File /r "${NODEMODS}\*.*"
  ${EndIf}
  ${If} $NeedNode == "1"
    nsExec::ExecToStack 'cmd.exe /c where node.exe'
    Pop $0
    Pop $1
    ${If} $0 != "0"
    ${AndIfNot} ${FileExists} "$INSTDIR\node\node.exe"
      DetailPrint "Baixando o Node.js (LTS)…"
      CreateDirectory "$INSTDIR\node"
      nsExec::ExecToLog `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $$v=(Invoke-RestMethod https://nodejs.org/dist/index.json | Where-Object { $$_.lts } | Select-Object -First 1).version; $$z=Join-Path $$env:TEMP ('node-'+$$v+'.zip'); Invoke-WebRequest ('https://nodejs.org/dist/'+$$v+'/node-'+$$v+'-win-x64.zip') -OutFile $$z -UseBasicParsing; $$d=Join-Path $$env:TEMP ('node-'+$$v); Expand-Archive $$z -DestinationPath $$d -Force; Copy-Item (Get-ChildItem $$d -Recurse -Filter node.exe | Select-Object -First 1).FullName '$INSTDIR\node\node.exe' -Force"`
      Pop $0
      ${IfNot} ${FileExists} "$INSTDIR\node\node.exe"
        MessageBox MB_ICONEXCLAMATION "Não foi possível baixar o Node.js. Instale o Node.js LTS (https://nodejs.org) e rode este instalador de novo." /SD IDOK
      ${EndIf}
    ${EndIf}
  ${EndIf}
SectionEnd

; Cria os serviços depois de tudo copiado (o Node precisa existir antes).
Section "-Services" SecServices
  SetRegView 64
  ${If} ${SectionIsSelected} ${SecProxmox}
    !insertmacro InstallCollector "proxmox" "proxmox-collector.js" "Coletor_Proxmox" "--token $Token"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecVmware}
    !insertmacro InstallCollector "vmware" "vmware-collector.js" "Coletor_VMware" "--token $Token"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecIlo}
    !insertmacro InstallCollector "ilo" "ilo-collector.js" "Coletor_iLO" "--token $Token"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecIdrac}
    !insertmacro InstallCollector "idrac" "idrac-collector.js" "Coletor_iDRAC" "--token $Token"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecDvr}
    !insertmacro InstallCollector "dvr" "dvr-vps-collector.js" "Coletor_DVR" ""
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecWindows}
    !insertmacro InstallCollector "windows" "windows-server-collector.ps1" "Coletor_WindowsServer" "-Token $Token"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SecSql}
    !insertmacro InstallCollector "sqlserver" "sqlserver-collector.ps1" "Coletor_SQLServer" "-Token $Token"
  ${EndIf}

  CreateDirectory "$SMPROGRAMS\Mororo.Tech"
  CreateShortCut "$SMPROGRAMS\Mororo.Tech\Desinstalar Mororo.Tech Coletores.lnk" "$INSTDIR\desinstalar.exe"
  CreateShortCut "$SMPROGRAMS\Mororo.Tech\Pasta dos coletores.lnk" "$INSTDIR"

  !define ARP "Software\Microsoft\Windows\CurrentVersion\Uninstall\MororoColetores"
  WriteRegStr HKLM "${ARP}" "DisplayName" "Mororo.Tech Coletores"
  WriteRegStr HKLM "${ARP}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${ARP}" "Publisher" "Mororo.Tech"
  WriteRegStr HKLM "${ARP}" "DisplayIcon" "$INSTDIR\mororo-agent.ico"
  WriteRegStr HKLM "${ARP}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${ARP}" "UninstallString" '"$INSTDIR\desinstalar.exe"'
  WriteRegStr HKLM "${ARP}" "QuietUninstallString" '"$INSTDIR\desinstalar.exe" /S'
  WriteRegDWORD HKLM "${ARP}" "NoModify" 1
  WriteRegDWORD HKLM "${ARP}" "NoRepair" 1
SectionEnd

LangString DESC_Proxmox ${LANG_PORTUGUESEBR} "Nós, storages e VMs/contêineres do Proxmox VE (API, porta 8006)."
LangString DESC_Vmware ${LANG_PORTUGUESEBR} "Hosts ESXi standalone por SSH: VMs, datastores e saúde."
LangString DESC_Ilo ${LANG_PORTUGUESEBR} "Saúde de hardware dos servidores HP pelo iLO (Redfish)."
LangString DESC_Idrac ${LANG_PORTUGUESEBR} "Saúde de hardware dos servidores Dell pelo iDRAC (Redfish)."
LangString DESC_Dvr ${LANG_PORTUGUESEBR} "Status dos DVRs/NVRs Intelbras e das câmeras."
LangString DESC_Windows ${LANG_PORTUGUESEBR} "Servidores Windows remotos via WinRM (use o Mororo.Tech Agent nos próprios servidores, se puder)."
LangString DESC_Sql ${LANG_PORTUGUESEBR} "Instâncias SQL Server: bloqueios, backups, jobs, PLE e latência."
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecProxmox} $(DESC_Proxmox)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecVmware} $(DESC_Vmware)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecIlo} $(DESC_Ilo)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecIdrac} $(DESC_Idrac)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDvr} $(DESC_Dvr)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecWindows} $(DESC_Windows)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecSql} $(DESC_Sql)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ----------------------------------------------------------------- telas e parâmetros

!macro SelectIfListed NAME SEC
  ${WordFind} ",$Coletores," ",${NAME}," "E+1{" $R9
  ${IfNot} ${Errors}
    !insertmacro SelectSection ${SEC}
  ${EndIf}
  ClearErrors
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este instalador é para Windows 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
  StrCpy $Intervalo "300"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/TOKEN=" $Token
  ClearErrors
  ${GetOptions} $R0 "/INTERVALO=" $R1
  ${IfNot} ${Errors}
    StrCpy $Intervalo $R1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/COLETORES=" $Coletores
  ClearErrors
  ${If} $Coletores != ""
    !insertmacro SelectIfListed "proxmox" ${SecProxmox}
    !insertmacro SelectIfListed "vmware" ${SecVmware}
    !insertmacro SelectIfListed "ilo" ${SecIlo}
    !insertmacro SelectIfListed "idrac" ${SecIdrac}
    !insertmacro SelectIfListed "dvr" ${SecDvr}
    !insertmacro SelectIfListed "windows" ${SecWindows}
    !insertmacro SelectIfListed "sqlserver" ${SecSql}
  ${EndIf}
FunctionEnd

Function TokenPage
  !insertmacro MUI_HEADER_TEXT "Token do agente" "Usado pelos coletores para enviar os dados ao painel"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 12u "Token do agente (Monitor de Servidores → Agentes & Alertas):"
  ${NSD_CreatePassword} 0 14u 100% 13u "$Token"
  Pop $hToken
  ${NSD_CreateLabel} 0 36u 60% 12u "Intervalo de coleta (segundos):"
  ${NSD_CreateNumber} 62% 34u 20% 13u "$Intervalo"
  Pop $hIntervalo
  ${NSD_CreateLabel} 0 58u 100% 40u "O coletor de DVR usa a chave pública do painel e não precisa de token. Os demais exigem um token com o escopo do coletor (ou Agente unificado)."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function TokenLeave
  ${NSD_GetText} $hToken $Token
  ${NSD_GetText} $hIntervalo $Intervalo
  ${If} $Token == ""
    ${If} ${SectionIsSelected} ${SecProxmox}
    ${OrIf} ${SectionIsSelected} ${SecVmware}
    ${OrIf} ${SectionIsSelected} ${SecIlo}
    ${OrIf} ${SectionIsSelected} ${SecIdrac}
    ${OrIf} ${SectionIsSelected} ${SecWindows}
    ${OrIf} ${SectionIsSelected} ${SecSql}
      MessageBox MB_ICONEXCLAMATION "Informe o token do agente."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Section "Uninstall"
  SetRegView 64
  !insertmacro UninstallCollector "proxmox"
  !insertmacro UninstallCollector "vmware"
  !insertmacro UninstallCollector "ilo"
  !insertmacro UninstallCollector "idrac"
  !insertmacro UninstallCollector "dvr"
  !insertmacro UninstallCollector "windows"
  !insertmacro UninstallCollector "sqlserver"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\node_modules"
  Delete "$INSTDIR\mororo-agent.ico"
  Delete "$INSTDIR\desinstalar.exe"
  RMDir "$INSTDIR"
  RMDir "$PROGRAMFILES64\MororoTech"
  Delete "$SMPROGRAMS\Mororo.Tech\Desinstalar Mororo.Tech Coletores.lnk"
  Delete "$SMPROGRAMS\Mororo.Tech\Pasta dos coletores.lnk"
  RMDir "$SMPROGRAMS\Mororo.Tech"
  DeleteRegKey HKLM "Software\MororoTech\Coletores"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MororoColetores"
SectionEnd
