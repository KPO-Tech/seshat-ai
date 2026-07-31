; Installs LibreOffice alongside SeshatOS if it isn't already present.
; LibreOffice powers real visual DOCX/PPTX/XLSX previews (see
; seshat-backend/internal/officeconvert) - it's an optional runtime
; dependency, not something SeshatOS bundles or requires: without it,
; document previews just fall back to the extracted-text view, so any
; failure in this macro must never abort the SeshatOS install itself.
;
; Version is pinned rather than resolved dynamically (plain NSIS has no
; clean way to query "latest stable") - bump LIBREOFFICE_VERSION and the
; download URL together when updating.

!macro customInstall
  IfFileExists "$PROGRAMFILES64\LibreOffice\program\soffice.exe" LibreOfficeAlreadyInstalled
  IfFileExists "$PROGRAMFILES32\LibreOffice\program\soffice.exe" LibreOfficeAlreadyInstalled

  DetailPrint "Downloading LibreOffice (enables DOCX/PPTX/XLSX document previews)..."
  NSISdl::download "https://download.documentfoundation.org/libreoffice/stable/26.2.5/win/x86_64/LibreOffice_26.2.5_Win_x86-64.msi" "$TEMP\SeshatOS-LibreOfficeSetup.msi"
  Pop $0
  StrCmp $0 "success" LibreOfficeDownloadOK LibreOfficeDownloadFailed

  LibreOfficeDownloadOK:
    DetailPrint "Installing LibreOffice (this can take a minute)..."
    ExecWait 'msiexec /i "$TEMP\SeshatOS-LibreOfficeSetup.msi" /quiet /norestart' $1
    DetailPrint "LibreOffice installer exited with code $1."
    Delete "$TEMP\SeshatOS-LibreOfficeSetup.msi"
    Goto LibreOfficeDone

  LibreOfficeDownloadFailed:
    DetailPrint "LibreOffice download failed ($0) - document previews will use the text-only fallback."
    Goto LibreOfficeDone

  LibreOfficeAlreadyInstalled:
    DetailPrint "LibreOffice already installed - skipping."

  LibreOfficeDone:
!macroend
