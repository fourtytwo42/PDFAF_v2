# Florida FDLE Publications Holdout - 2026-05-25

## Source

- Public source: Florida Department of Law Enforcement publications page.
- Source page: `https://www.fdle.state.fl.us/publications/`
- Sample: first 20 successfully downloaded official FDLE PDF assets from the publications page after excluding external links and non-PDF files.
- Size gate: every downloaded PDF was under 10 MiB; sampled files were about `21 KB` to `5.5 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/florida-fdle-publications-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/florida-fdle-publications-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `96.3500`
- Median: `96`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `1`
- Runtime p50/p95/max: `12210ms / 34893ms / 103376ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/florida-fdle-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`

Only one row was below `93`: `fldlepub-12-TRACK-KIT-Sexual_Assault_Kit_Form_for_Healthcare_Providers-2023-Fillable-update.pdf` scored `92/A`. It was classified as `near_miss_monitor` with no category/tool signal below safe diagnostic thresholds. The lowest categories were `reading_order=79`, `pdf_ua_compliance=83`, `form_accessibility=89`, `heading_structure=95`, and `text_extractability=96`.

## Decision

This holdout passed without behavior changes. The source met the target mean at `96.3500`, median `96`, with all rows A-grade, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
