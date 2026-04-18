# Windows Installer Notes

## Build

Use `pnpm desktop:package:win` to produce the Windows release artifacts under `apps/desktop/dist-packaged/`.

The Stage 6 packaging flow produces:

- an NSIS installer
- a `win-unpacked` directory for local QA
- `SHA256SUMS.txt` for generated release artifacts

## Uninstall and data retention

The Windows uninstaller removes the installed PDFAF application binaries and shortcuts.

User data is retained by default under the Electron user-data directory, including:

- the desktop database
- stored source and remediated PDFs
- desktop logs
- optional local AI runtime and model files

This retention policy is intentional so reinstall and upgrade flows preserve user work and large downloaded model assets.

## Upgrade behavior

In-place upgrades are expected to preserve:

- desktop app data
- tray hint state
- stored PDFs
- local AI installation state and downloaded artifacts
