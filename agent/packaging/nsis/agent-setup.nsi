; Mororo.Tech Agent — instalador do Windows (Setup.exe)
;
; Interativo: telas Avançar/Concluir, token do cliente e tipo da máquina.
; Silencioso:  mororo-agent-setup.exe /S /TOKEN=mt_xxx /ROLE=workstation
;              (ROLE = server | workstation; /NODESKTOP para não mexer no papel de parede)
; Compilar:    makensis -DVERSION=1.0.0 -DURL=https://api.mororo.tech -DSRC=<pasta do .exe> -DOUT=<saída> agent-setup.nsi

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef URL
  !define URL "https://api.mororo.tech"
!endif
!ifndef SRC
  !define SRC "..\..\..\public\downloads"
!endif
!ifndef OUT
  !define OUT "mororo-agent-setup.exe"
!endif

Name "Mororo.Tech Agent"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\MororoTech\Agent"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "Mororo.Tech"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Mororo.Tech Agent"
VIAddVersionKey /LANG=1046 "CompanyName" "Mororo.Tech"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do Mororo.Tech Agent"
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

!define MUI_WELCOMEPAGE_TITLE "Mororo.Tech Agent ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o agente de monitoramento, inventário e suporte da Mororo.Tech.$\r$\n$\r$\nVocê vai precisar do token do cliente, gerado no painel em Monitor de Servidores → Agentes & Alertas.$\r$\n$\r$\nClique em Avançar para continuar."
!insertmacro MUI_PAGE_WELCOME
Page custom ConfigPage ConfigLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Mororo.Tech Agent instalado"
!define MUI_FINISHPAGE_TEXT "O agente já está rodando como serviço e enviando os dados para o painel."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o assistente para escolher equipamentos da rede (Proxmox, iLO, impressoras, sites…)"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenWizard
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

Var Token
Var Role
Var ShowDesktop
Var hToken
Var hServer
Var hWorkstation
Var hDesktop

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este instalador é para Windows 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/TOKEN=" $Token
  ${GetOptions} $R0 "/ROLE=" $Role
  StrCpy $ShowDesktop "1"
  ClearErrors
  ${GetOptions} $R0 "/NODESKTOP" $R1
  ${IfNot} ${Errors}
    StrCpy $ShowDesktop "0"
  ${EndIf}
  ${If} $Role != "server"
  ${AndIf} $Role != "workstation"
    ; Windows Server → servidor; os demais → estação
    ReadRegStr $R2 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "InstallationType"
    ${If} $R2 == "Server"
      StrCpy $Role "server"
    ${Else}
      StrCpy $Role "workstation"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function ConfigPage
  !insertmacro MUI_HEADER_TEXT "Configuração" "Token do cliente e tipo deste computador"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 12u "Token do agente (escopo Agente unificado, vinculado ao cliente):"
  ${NSD_CreatePassword} 0 14u 100% 13u "$Token"
  Pop $hToken
  ${NSD_CreateLabel} 0 30u 100% 20u "Deixe em branco para configurar depois pelo assistente (token, tipo e equipamentos da rede)."
  Pop $0
  ${NSD_CreateGroupBox} 0 54u 100% 52u "Este computador é"
  Pop $0
  ${NSD_CreateRadioButton} 10u 68u 90% 12u "Servidor — alertas completos (CPU, memória, discos, serviços, eventos)"
  Pop $hServer
  ${NSD_CreateRadioButton} 10u 84u 90% 12u "Estação de trabalho — inventário, saúde do disco e antivírus"
  Pop $hWorkstation
  ${If} $Role == "server"
    ${NSD_Check} $hServer
  ${Else}
    ${NSD_Check} $hWorkstation
  ${EndIf}
  ${NSD_CreateCheckBox} 0 114u 100% 12u "Mostrar informações de suporte no papel de parede"
  Pop $hDesktop
  ${If} $ShowDesktop == "1"
    ${NSD_Check} $hDesktop
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function ConfigLeave
  ${NSD_GetText} $hToken $Token
  ${NSD_GetState} $hServer $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Role "server"
  ${Else}
    StrCpy $Role "workstation"
  ${EndIf}
  ${NSD_GetState} $hDesktop $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ShowDesktop "1"
  ${Else}
    StrCpy $ShowDesktop "0"
  ${EndIf}
FunctionEnd

Function OpenWizard
  Exec '"$INSTDIR\mororo-agent.exe" install --no-arp'
FunctionEnd

Section "Mororo.Tech Agent" SecMain
  SectionIn RO
  SetRegView 64
  ; Para o serviço antes de trocar o executável (atualização).
  nsExec::Exec 'sc.exe stop MororoAgent'
  nsExec::Exec 'taskkill /F /IM mororo-agent.exe'
  Sleep 1500
  SetOutPath "$INSTDIR"
  File "${SRC}\mororo-agent.exe"
  File "mororo-agent.ico"
  WriteUninstaller "$INSTDIR\desinstalar.exe"

  StrCpy $1 ""
  ${If} $ShowDesktop == "0"
    StrCpy $1 "--no-desktop"
  ${EndIf}

  ${If} $Token != ""
    DetailPrint "Configurando o agente para o painel…"
    nsExec::ExecToLog '"$INSTDIR\mororo-agent.exe" install --token "$Token" --role $Role --url "${URL}" --quiet --no-arp $1'
    Pop $0
    ${If} $0 != "0"
      MessageBox MB_ICONEXCLAMATION|MB_OK "Não foi possível ativar o agente (código $0). Confira o token e a internet e rode o assistente pelo menu Iniciar." /SD IDOK
    ${EndIf}
  ${ElseIf} ${FileExists} "$COMMONPROGRAMDATA\MororoAgent\config.json"
    ; Atualização: já configurado — só reinstala o serviço com o executável novo.
    DetailPrint "Atualizando o serviço…"
    nsExec::ExecToLog '"$INSTDIR\mororo-agent.exe" install --quiet --no-arp --reuse'
  ${Else}
    ${IfNot} ${Silent}
      Exec '"$INSTDIR\mororo-agent.exe" install --no-arp'
    ${EndIf}
  ${EndIf}

  ; Menu Iniciar
  CreateDirectory "$SMPROGRAMS\Mororo.Tech"
  CreateShortCut "$SMPROGRAMS\Mororo.Tech\Mororo.Tech Agent - Assistente.lnk" "$INSTDIR\mororo-agent.exe" "install --no-arp" "$INSTDIR\mororo-agent.ico"
  CreateShortCut "$SMPROGRAMS\Mororo.Tech\Desinstalar Mororo.Tech Agent.lnk" "$INSTDIR\desinstalar.exe"

  ; Aplicativos instalados
  !define ARP "Software\Microsoft\Windows\CurrentVersion\Uninstall\MororoAgent"
  WriteRegStr HKLM "${ARP}" "DisplayName" "Mororo.Tech Agent"
  WriteRegStr HKLM "${ARP}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${ARP}" "Publisher" "Mororo.Tech"
  WriteRegStr HKLM "${ARP}" "DisplayIcon" "$INSTDIR\mororo-agent.ico"
  WriteRegStr HKLM "${ARP}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${ARP}" "UninstallString" '"$INSTDIR\desinstalar.exe"'
  WriteRegStr HKLM "${ARP}" "QuietUninstallString" '"$INSTDIR\desinstalar.exe" /S'
  WriteRegStr HKLM "${ARP}" "URLInfoAbout" "https://mororo.tech"
  WriteRegDWORD HKLM "${ARP}" "NoModify" 1
  WriteRegDWORD HKLM "${ARP}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${ARP}" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  SetRegView 64
  nsExec::ExecToLog '"$INSTDIR\mororo-agent.exe" uninstall --quiet --keep-files'
  nsExec::Exec 'taskkill /F /IM mororo-agent.exe'
  Sleep 1000
  Delete "$INSTDIR\mororo-agent.exe"
  Delete "$INSTDIR\mororo-agent.exe.old"
  Delete "$INSTDIR\mororo-agent.ico"
  Delete "$INSTDIR\desinstalar.exe"
  RMDir "$INSTDIR"
  RMDir "$PROGRAMFILES64\MororoTech"
  Delete "$SMPROGRAMS\Mororo.Tech\Mororo.Tech Agent - Assistente.lnk"
  Delete "$SMPROGRAMS\Mororo.Tech\Desinstalar Mororo.Tech Agent.lnk"
  RMDir "$SMPROGRAMS\Mororo.Tech"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MororoAgent"
SectionEnd
