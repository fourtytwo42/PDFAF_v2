# Windows Release Checklist

Use this checklist before sharing a Windows desktop build outside the team.

## Build outputs

- Run `pnpm desktop:package:win`.
- Confirm `apps/desktop/dist-packaged/` contains:
  - `PDFAF-Setup-<version>-x64.exe`
  - `PDFAF-Setup-<version>-x64.exe.blockmap`
  - `win-unpacked/`
  - `SHA256SUMS.txt`
  - `release-metadata.json`
- Confirm `pnpm desktop:release:verify` passes.

## Fresh machine install

- Install from the NSIS installer on a clean Windows machine or VM.
- Launch from the installer completion flow.
- Launch again from the Start menu.
- Confirm the app opens successfully and the tray icon appears.
- Close the window and confirm the app remains in the notification area.
- Reopen from tray double-click and from the tray menu.

## Core runtime checks

- Open Settings and confirm Local AI and Desktop Diagnostics cards render.
- Export a support bundle and confirm a `.zip` file is created.
- Open the data folder and logs folder from diagnostics actions.
- Use `Restart App Services` and confirm the UI reconnects.
- Verify `/v1/health` is reachable through the app after restart.

## Persistence and local AI

- Analyze a PDF and confirm persisted desktop storage survives restart.
- Install local AI, wait for validation, then restart the app.
- Confirm local AI state survives restart.
- Disable, enable, and remove local AI from the settings UI.
- Use `Reset Local AI` and confirm only local-AI artifacts are removed.

## Upgrade and uninstall

- Install a new build over an older version with existing app data.
- Confirm stored PDFs, tray hint state, and local AI state are preserved when expected.
- Uninstall the app and confirm binaries and shortcuts are removed.
- Confirm user data is retained by default.
- Reinstall and confirm the app starts without manual cleanup.

## Failure-path checks

- Simulate or force an API/web startup failure and confirm the error dialog points to logs.
- Confirm support bundle export still works after a recoverable failure.
- Confirm no PDF payloads or Base64 content appear in support bundle files.

## Release decision

- Mark the build blocked if any checklist item fails.
- Mark the build release-ready only when a clean machine and an upgrade machine both pass.
