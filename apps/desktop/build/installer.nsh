!macro customInstall
  SetDetailsPrint both
  DetailPrint "Preparing installation"
  DetailPrint "Installing PDFAF application"
  DetailPrint "Installing bundled runtime"
  DetailPrint "Downloading required local AI runtime and model"
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 missing_runtime
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\app.asar.unpacked\apps\desktop\dist\install-local-llm.js" --app-data-dir "$APPDATA\pdfaf-v2\data"'
  Pop $0
  StrCmp $0 0 +3 0
    MessageBox MB_ICONSTOP|MB_OK "PDFAF could not complete required local AI setup. Please verify your network connection and run the installer again."
    Abort
  Goto done_ai_phase
missing_runtime:
  MessageBox MB_ICONSTOP|MB_OK "PDFAF could not find its bundled Node runtime. Setup cannot continue."
  Abort
done_ai_phase:
  DetailPrint "Verifying local AI files"
  DetailPrint "Finalizing setup"
!macroend
