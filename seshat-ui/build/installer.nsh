; Custom NSIS hook, wired via build.nsis.include in package.json.
;
; SeshatOS's local runtime root ($PROFILE\.config\seshat by default - see
; seshat-ui/src/main/runtime.ts's resolveRuntimeRoot and the seshat SDK's
; runtimepath.ResolveRoot) is NOT just settings: it holds seshat.db, the
; entire local SQLite database (sessions, conversations, memories, plans,
; knowledge corpus metadata), plus file attachments, whisper models, logs,
; and cache. The default electron-builder uninstaller never touches it, so
; a plain uninstall/reinstall keeps all local data - normally correct, but
; it also means there is no built-in way to get a fully clean slate.
;
; This hook adds that as an explicit, opt-in uninstaller step: ask first,
; default to "No", and never touch anything in a silent/unattended
; uninstall (no consent is possible there, so the safe choice is to leave
; the data alone rather than guess).
;
; Explicit include needed here (unlike inside a !macro body, which is only
; expanded later via !insertmacro - by then installer.nsi has already
; included MUI2.nsh itself): the Function...FunctionEnd blocks below are
; top-level and get compiled immediately as this file is !include'd, which
; happens BEFORE installer.nsi's own MUI2.nsh include - so ${If}, nsDialogs,
; and MUI_HEADER_TEXT are not yet defined at that point without pulling
; them in ourselves. MUI2.nsh (and the LogicLib/nsDialogs/WinMessages it
; pulls in) guards against re-inclusion, so it's safe that installer.nsi
; includes it again afterward for its own page-flow setup.
!include "MUI2.nsh"

!macro customUnInstall
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Also delete your SeshatOS data (conversations, knowledge bases, settings)?$\r$\n$\r$\nThis permanently removes $PROFILE\.config\seshat and cannot be undone." \
      IDYES seshat_delete_data
    Goto seshat_keep_data

    seshat_delete_data:
      ReadEnvStr $0 "SESHAT_RUNTIME_ROOT"
      ${If} $0 == ""
        ReadEnvStr $0 "NEXUS_RUNTIME_ROOT"
      ${EndIf}
      ${If} $0 == ""
        StrCpy $0 "$PROFILE\.config\seshat"
      ${EndIf}
      RMDir /r "$0"

    seshat_keep_data:
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; Custom page: Docling setup + runtime directory (assisted/wizard installer
; only - requires build.nsis.oneClick=false in package.json). Inserted
; between the directory page and file-copy via customPageAfterChangeDir.
;
; The three Function...FunctionEnd blocks below are guarded by
; !ifndef BUILD_UNINSTALLER: NSIS compiles every plain (non-"un."-prefixed)
; Function in BOTH the installer and uninstaller passes regardless of
; whether anything actually calls it in a given pass - customPageAfterChangeDir
; only ever gets inserted in the installer pass, so without this guard the
; uninstaller pass sees an unreferenced function and (with electron-builder's
; warnings-as-errors makensis flags) fails the whole build with warning 6010.
; ---------------------------------------------------------------------------

!ifndef BUILD_UNINSTALLER

Var DoclingCheckbox
Var DoclingCheckboxState      ; BST_CHECKED / BST_UNCHECKED, read in customInstall
Var RuntimeRootField
Var RuntimeRootValue          ; final chosen path, read in customInstall
Var RuntimeRootDefault        ; pre-filled default, computed once in page-create

!macro customPageAfterChangeDir
  Page custom DoclingPageCreate DoclingPageLeave
!macroend

Function DoclingPageCreate
  ; Real default from src/main/runtime.ts's resolveRuntimeRoot() / the seshat
  ; SDK's runtimepath.ResolveRoot: <home>\.config\seshat. $PROFILE is NSIS's
  ; per-current-user home dir - same value app.getPath('home') resolves to.
  StrCpy $RuntimeRootDefault "$PROFILE\.config\seshat"
  StrCpy $RuntimeRootValue "$RuntimeRootDefault"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Document Conversion Setup" \
    "Choose whether to set up Docling now, and where SeshatOS stores its data."

  ${NSD_CreateCheckbox} 0 0 100% 12u "Set up Docling (document conversion) via uv"
  Pop $DoclingCheckbox
  ${NSD_Check} $DoclingCheckbox

  ${NSD_CreateLabel} 0 30u 100% 12u "SeshatOS data directory:"
  Pop $0

  ${NSD_CreateText} 0 42u 75% 12u "$RuntimeRootDefault"
  Pop $RuntimeRootField

  ${NSD_CreateBrowseButton} 78% 42u 22% 12u "Browse..."
  Pop $0
  ${NSD_OnClick} $0 DoclingBrowseClick

  nsDialogs::Show
FunctionEnd

Function DoclingBrowseClick
  ${NSD_GetText} $RuntimeRootField $0
  nsDialogs::SelectFolderDialog "Select SeshatOS data directory" "$0"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $RuntimeRootField "$1"
  ${EndIf}
FunctionEnd

Function DoclingPageLeave
  ${NSD_GetState} $DoclingCheckbox $DoclingCheckboxState
  ${NSD_GetText} $RuntimeRootField $RuntimeRootValue
  ${If} $RuntimeRootValue == ""
    StrCpy $RuntimeRootValue "$RuntimeRootDefault"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; (a) Conditionally run the bundled installer-only PowerShell script.
  ;     Soft-fail: never abort the SeshatOS install if this fails - Docling
  ;     is optional everywhere else (falls back to plain-text extraction,
  ;     see docs/RUNTIME.md).
  ${If} $DoclingCheckboxState == ${BST_CHECKED}
    DetailPrint "Setting up Docling (this can take a few minutes)..."
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-docling.ps1" -RuntimeRoot "$RuntimeRootValue"'
    Pop $0
    ${If} $0 != 0
      DetailPrint "Docling setup did not complete (exit code $0) - document conversion will fall back to plain-text extraction until it's set up manually."
    ${EndIf}
  ${EndIf}

  ; (b) Only persist an override if the user actually changed the path -
  ;     leave today's no-override default resolution untouched otherwise.
  ${If} $RuntimeRootValue != $RuntimeRootDefault
    WriteRegExpandStr HKCU "Environment" "SESHAT_RUNTIME_ROOT" "$RuntimeRootValue"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!endif ; !BUILD_UNINSTALLER
