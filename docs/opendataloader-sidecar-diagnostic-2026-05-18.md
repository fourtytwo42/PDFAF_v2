# OpenDataLoader Sidecar Diagnostic Implementation

Status: diagnostic-only implementation complete.

## What Changed

- Added `scripts/opendataloader-sidecar-diagnostic.ts`.
- Added passive `fontSyntaxAudit` fields computed from existing pdf.js text:
  - `replacementCharacterCount`
  - `replacementCharacterRatio`
  - `highReplacementCharacterPageCount`
- Added unit coverage for replacement-character counting, snapshot merge passivity, sidecar argument/manifest helpers, missing-command handling, timeout handling, and OpenDataLoader JSON summarization.

The sidecar is not imported by API, Docker, analyzer, remediation, or benchmark paths. It runs only when explicitly invoked.

## Sidecar Mode

The sidecar invokes OpenDataLoader with:

```text
--format json --image-output off --quiet --threads 1
```

It does not request `tagged-pdf`, does not write remediated PDFs, and does not affect PDFAF scores.

Default output root:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/<timestamp>
```

## First Smoke Run

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/opendataloader-sidecar-diagnostic.ts \
  --pdf Input/experiment-corpus/00-fixtures/ADAM2.pdf \
  --out /mnt/pdf-review/pdfaf-odl-diagnostics/smoke-2026-05-18-r1 \
  --limit 1 \
  --timeout-ms 1000
```

Result:

- PDFAF analysis completed for `ADAM2`.
- `opendataloader-pdf` was not present on PATH.
- The row was recorded as `missing_command`.
- The process exited successfully and wrote a local Markdown/JSON report.

Local report:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/smoke-2026-05-18-r1/comparison-report.md
```

The requested 10 outside-corpus plus 5 original-corpus OpenDataLoader comparison was not run yet because the local `opendataloader-pdf` command is unavailable and this plan explicitly forbids auto-installing, building, or fetching OpenDataLoader during PDFAF work.

## Current Lane Decision

No behavior lane is accepted from the sidecar yet.

- CID/text extraction: only the passive replacement-character metric is now available.
- Reading order: no OpenDataLoader JSON evidence yet.
- Table structure: no OpenDataLoader JSON evidence yet.
- Remediation behavior: unchanged.

Next useful diagnostic step is to install or expose `opendataloader-pdf` outside this repo, then run the sidecar against 10 outside-corpus lows and 5 original controls. Raw JSON and PDFs should remain local under `/mnt/pdf-review`.
