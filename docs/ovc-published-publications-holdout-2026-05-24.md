# OVC Published Publications Public Holdout

Date: 2026-05-24

Source: Office for Victims of Crime published publications listing: `https://ovc.ojp.gov/library/publications?field_published_sponsored_value=Published&page=0`

This was a 20-PDF public holdout sample from official OVC publication PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 reachable official OVC publication PDFs under the repository's `10 MiB` cap, selected from the published-publications listing pages.
- Selected IDs: `ovc-01` through `ovc-20`.
- Size cap: all 20 selected PDFs were under `10 MiB`; selected files were about `532 KB` to `9.8 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, figure/alt diagnostic, and an 11-row low-score repeat.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/ovc-published-publications-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `72.40 -> 92.40`.
- Median after remediation: `92`.
- Grades after remediation: `16 A / 4 B / 0 C / 0 D / 0 F`.
- Rows below 93: `11`.
- Runtime p50/p95/max: `21381ms / 44798ms / 58978ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `no_safe_low_row_lane`:

- Raw points needed for 93 mean: `12`.
- Recommended lane: `reading_link_order_candidate`.
- Reading/link-order candidate rows: `8`, carrying `22` candidate raw points.
- No-safe-predicate rows: `1`, carrying `7` candidate raw points.
- Near-miss monitor rows: `2`, carrying `4` candidate raw points.

The row families were:

- Reading/link-order candidates: `ovc-09`, `ovc-20`, `ovc-07`, `ovc-05`, `ovc-12`, `ovc-06`, `ovc-18`, `ovc-19`.
- No-safe-predicate row: `ovc-17`, with `heading_structure=60`.
- Near-miss monitor rows: `ovc-11`, `ovc-13`.

The figure/alt diagnostic rejected the alt lane:

- Decision: `keep_figure_alt_diagnostic_only`.
- Scoring candidates: `0`.
- Behavior candidates: `0`.
- All rows were classified as `alt_high_or_not_focus`.

The 11-row low-score repeat reproduced the source miss:

- `ovc-05`: `90/A`.
- `ovc-06`: `92/A`.
- `ovc-07`: `89/B`.
- `ovc-09`: `88/B`.
- `ovc-11`: `91/A`.
- `ovc-12`: `92/A`.
- `ovc-13`: `91/A`.
- `ovc-17`: `86/B`.
- `ovc-18`: `92/A`.
- `ovc-19`: `92/A`.
- `ovc-20`: `88/B`.

Only `ovc-12` moved by one point in the repeat (`91 -> 92`); the rest matched the full-source run.

## Decision

No source behavior change is accepted from this source.

OVC publications are a useful outside-corpus near miss: the source is short of 93 by only `12` raw points, and the low rows repeat. The dominant residual is reading/link-order debt on illustrated victim-support materials plus one heading-structure row. The current diagnostic stack does not yet prove a safe, general arbitrary-source reading/link-order promotion path, and there is no figure/alt opportunity. Do not add OVC/source/family-specific behavior.

Because no source behavior changed, no original-50 regression validation was required for this source.
