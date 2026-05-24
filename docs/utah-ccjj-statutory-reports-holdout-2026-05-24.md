# Utah CCJJ Statutory Reports Public Holdout

Date: 2026-05-24

Source: Utah Commission on Criminal and Juvenile Justice statutory reports page: `https://justice.utah.gov/research-and-reports/statutory-reports/`

This was a 20-PDF public holdout sample from official Utah CCJJ statutory report PDFs under 10 MiB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 unique report PDFs from the Utah CCJJ statutory reports page with successful PDF download and size under `10 MiB`.
- Selected IDs: `utccjj-01` through `utccjj-20`.
- Size cap: all 20 selected PDFs were under `10 MiB`; selected files were about `142 KB` to `3.7 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, table target-resolution diagnostic, and a local Stage 180 retargeting proof that was rejected and not kept.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/utah-ccjj-statutory-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `44.50 -> 89.55`.
- Median after remediation: `93`.
- Grades after remediation: `16 A / 1 B / 0 C / 3 D / 0 F`.
- Rows below 93: `6`.
- Runtime p50/p95/max: `23704ms / 113359ms / 152147ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic`:

- Raw points needed for 93 mean: `69`.
- Recommended lane: `table_target_resolution_needed`.
- Table target-resolution rows: `3`, carrying `72` candidate raw points.
- Reading/link-order candidate rows: `1`, carrying `11` candidate raw points.
- Near-miss monitor rows: `2`, carrying `3` candidate raw points.

The low rows were:

- `utccjj-01`: `69/D`.
- `utccjj-19`: `69/D`.
- `utccjj-20`: `69/D`.
- `utccjj-16`: `82/B`.
- `utccjj-17`: `91/A`.
- `utccjj-13`: `92/A`.

The focused table target-resolution diagnostic showed a cleaner table signal than many earlier public sources:

- Decision: `plan_table_target_behavior_proof`.
- Stable focus candidates: `utccjj-01`, `utccjj-19`, `utccjj-20`.
- Unsafe control candidates: none in the selected same-source controls.
- Prior non-table target rows: none.

However, the current Stage 180 table path had already fired on the three focus rows and still left them at `69/D`. A narrow local proof was tested and rejected: recomputing Stage 180 explicit continuation targets after the accepted header-regularization sequence did not move any target row.

Rejected local proof before cleanup: `/mnt/pdf-review/public-holdouts/utah-ccjj-statutory-reports-2026-05-24/stage180-recompute-proof-r1/baseline_report.json`

- `utccjj-01`: `51/F -> 69/D`.
- `utccjj-19`: `58/F -> 69/D`.
- `utccjj-20`: `58/F -> 69/D`.
- Same-source controls stayed A-grade: `utccjj-02`, `utccjj-10`, `utccjj-12`.
- `false_positive_applied`: `0`.
- The source change was reverted and not accepted.

## Decision

No source behavior change is accepted from this source.

Utah CCJJ statutory reports expose real, repeatable table debt on the DUI annual reports, and the target-resolution diagnostic is cleaner than the Colorado/OVC/COPS table cases. The immediate retargeting hypothesis did not improve the rows, so a production change is not justified yet. Future work should inspect why accepted Stage 180 header regularization and table-header association improvements still leave final `table_markup=0`, rather than broadening admission, weakening PAC table-header guards, or adding source-specific handling.

Because no source behavior changed, no original-50 regression validation was required for this source.
