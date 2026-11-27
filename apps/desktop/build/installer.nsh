; Explorer folder menu (blueprint ENTRY_POINTS/02): "Open this folder with Archa" on a folder and on a folder's
; background. SHCTX is HKLM for an all-users install and HKCU for a per-user one. Windows 11 lists it under
; "Show more options".

!macro archaFolderVerb KEY ARG
  WriteRegStr SHCTX "Software\Classes\${KEY}\shell\ArchaDev" "" "Open this folder with Archa"
  WriteRegStr SHCTX "Software\Classes\${KEY}\shell\ArchaDev" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\${KEY}\shell\ArchaDev\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --project "${ARG}"'
!macroend

!macro customInstall
  !insertmacro archaFolderVerb "Directory" "%1"
  !insertmacro archaFolderVerb "Directory\Background" "%V"
  !insertmacro archaFolderVerb "Drive" "%1"
  ; Tell Explorer the verbs changed.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller first; the new installer writes the keys again right after.
  ${ifNot} ${isUpdated}
    DeleteRegKey SHCTX "Software\Classes\Directory\shell\ArchaDev"
    DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\ArchaDev"
    DeleteRegKey SHCTX "Software\Classes\Drive\shell\ArchaDev"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${endIf}
!macroend
