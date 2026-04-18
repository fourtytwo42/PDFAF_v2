# Support Bundle Format

Desktop support bundles are exported by the Windows desktop app into the app data support directory as `.zip` files.

## Included files

- `pdfaf-desktop.log`
- `desktop-state.json`
- `local-llm-state.json`
- `runtime-manifest.json`
- `build-metadata.json`
- `diagnostics.json`

## Diagnostics contents

`diagnostics.json` should include:

- export timestamp
- desktop app version
- startup phase
- runtime mode
- bundled dependency paths and runtime versions
- local AI state summary
- current health snapshot when available

## Explicit exclusions

Support bundles must not include:

- stored source PDFs
- remediated PDFs
- uploaded payloads
- Base64 content
- arbitrary app data directories beyond the named diagnostic files
