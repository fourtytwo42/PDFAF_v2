# Connecticut Sentencing Commission Publications Public Holdout - 2026-05-25

## Source And Sample

- Source: `https://ctsentencingcommission.org/publications`
- Sample: `20` public Connecticut Sentencing Commission publication PDFs, each verified under `10MB`.
- Selection notes: selected the first 20 non-annual-report publication/memo PDFs from the official publications page, excluding bylaws and annual-report archive entries.
- Local artifact root: `/mnt/pdf-review/public-holdouts/connecticut-sentencing-commission-publications-2026-05-25`
- Validation mode: deterministic bounded holdout, Node 22, `--no-semantic --no-pdfs`, row artifacts cleaned.

## Full-Source Result

Run: `/mnt/pdf-review/public-holdouts/connecticut-sentencing-commission-publications-2026-05-25/run-r1/baseline_report.json`

- Completed: `20/20`
- Mean: `51.65 -> 93.10`
- Median after: `95`
- Grades after: `19 A / 0 B / 0 C / 0 D / 1 F`
- Rows below `93`: `5`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `19891ms / 83719ms / 231227ms`

Low rows:

| Row | Score | Dominant Debt |
| --- | ---: | --- |
| `ctsent-11.pdf` | `59/F` | stable `heading_structure=0`; no safe predicate visible from run artifact |
| `ctsent-01.pdf` | `90/A` | near miss; heading/PDF-UA/table mixed residual; runtime tail |
| `ctsent-02.pdf` | `92/A` | near miss; heading/PDF-UA/table residual |
| `ctsent-08.pdf` | `92/A` | near miss; reading/link/PDF-UA/table residual |
| `ctsent-17.pdf` | `92/A` | near miss; heading/table residual |

## Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/connecticut-sentencing-commission-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`

Lane split:

| Candidate Class | Rows | Raw Points To Target | Files |
| --- | ---: | ---: | --- |
| `no_safe_predicate` | `1` | `34` | `ctsent-11.pdf` |
| `near_miss_monitor` | `4` | `6` | `ctsent-01.pdf`, `ctsent-02.pdf`, `ctsent-08.pdf`, `ctsent-17.pdf` |

The only high-impact row is a zero-heading residual. Its tool timeline showed structure/link/page-furniture attempts plus `normalize_heading_hierarchy:no_effect`, but the run artifact did not expose a safe object-backed heading target. The source already cleared the mean target, so this is not enough evidence to broaden heading creation.

## Low-Row Repeat

Repeat run: `/mnt/pdf-review/public-holdouts/connecticut-sentencing-commission-publications-2026-05-25/low-repeat-r1/baseline_report.json`

- Completed: `5/5`
- Mean: `85.00`
- Grades: `4 A / 0 B / 0 C / 0 D / 1 F`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `33258ms / 188057ms / 188057ms`

Repeat outcomes:

| Row | Full Run | Repeat | Interpretation |
| --- | ---: | ---: | --- |
| `ctsent-01.pdf` | `90/A` | `90/A` | stable near miss; expensive but bounded |
| `ctsent-02.pdf` | `92/A` | `92/A` | stable near miss |
| `ctsent-08.pdf` | `92/A` | `92/A` | stable near miss |
| `ctsent-11.pdf` | `59/F` | `59/F` | stable zero-heading/no-safe-predicate debt |
| `ctsent-17.pdf` | `92/A` | `92/A` | stable near miss |

## Decision

This source passed without behavior changes. No engine behavior was accepted and no original-50 validation was required because there were no source changes.

Do not add Connecticut/source/report-family gates, filename gates, hash gates, heading broadening, PAC relaxations, or score masking from this evidence. If this lane is revisited, it should be a general native zero-heading object-target diagnostic that proves a visible/structured heading anchor and separates controls.

## Cleanup

Downloaded PDFs and generated artifacts were local-only and were deleted after metrics extraction.
