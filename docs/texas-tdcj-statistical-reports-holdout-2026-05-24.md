# Texas TDCJ Statistical Reports Public Holdout

Date: 2026-05-24

Sources:

- Texas Department of Criminal Justice Statistical Reports page: `https://www.tdcj.texas.gov/publications/statistical_reports.html`
- Direct official report host: `https://www.tdcj.texas.gov/documents/`

This was a 20-PDF public holdout sample from official Texas Department of Criminal Justice annual statistical report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 eligible `Statistical_Report_FY*.pdf` files linked from the official TDCJ statistical reports page.
- Report mix: FY 2025 through FY 2006.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `332 KB` to `6.30 MB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, and focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/texas-tdcj-statistical-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `65.35 -> 84.75`.
- Median after remediation: `93`.
- Grades after remediation: `12 A / 2 B / 0 C / 5 D / 1 F`.
- Rows below 93: `10`.
- Runtime p50/p95/max: `60931ms / 215029ms / 222214ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The five D-grade modern reports were `txtdcjstat-01.pdf`, `txtdcjstat-02.pdf`, `txtdcjstat-03.pdf`, `txtdcjstat-05.pdf`, and `txtdcjstat-06.pdf`. The lone F row was `txtdcjstat-17.pdf`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic` with recommended lane `table_target_resolution_needed`.

- Raw points needed for a mean of 93: `165`.
- Table target-resolution rows: `5`, carrying `127` raw points.
- No-safe-predicate rows: `txtdcjstat-17.pdf` and `txtdcjstat-16.pdf`, carrying `47` raw points.
- Additional low-priority residuals: `txtdcjstat-04.pdf` as `metadata_pdfua_candidate`, `txtdcjstat-18.pdf` as `reading_link_order_candidate`, and `txtdcjstat-10.pdf` as a one-point near miss.

Even a clean table lift would not fully close the source by itself, but table target identity is the highest-impact supported lane.

## Table Target Diagnostic

Focused table target-resolution diagnostic returned `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `txtdcjstat-01`, `txtdcjstat-02`, `txtdcjstat-03`, `txtdcjstat-05`, and `txtdcjstat-06`.
- Unsafe control candidates: `txtdcjstat-07`, `txtdcjstat-11`, and `txtdcjstat-12`.
- Prior non-table target rows: `txtdcjstat-08`, where `normalize_table_structure` had resolved a target as `TR`.

The focus rows have real object-backed table-shape debt and PAC table-header debt, but the same structural shape appears on high-scoring same-source controls. Existing table attempts also show PAC regressions around header association or row regularity. That is not clean enough for planner promotion.

## Other Residuals

`txtdcjstat-17.pdf` is a mixed route-collapse row rather than a clean heading-only candidate. It started with heading/table/alt debt, improved figure alt and table visibility on parts of the route, but ended with `heading_structure=0` and several PAC/table guard rejections. The run artifact does not expose a safe, general heading predicate for this row.

`txtdcjstat-16.pdf` improved from `55/F` to `80/B`, but remaining heading/alt/PDF-UA/table debt is mixed and includes mutator failures plus PAC table-row guards. It is not a safe single-lane behavior proof.

## Decision

No source behavior change is accepted from this source. TDCJ statistical reports are a useful below-target holdout with bounded runtime and `false_positive_applied=0`, but the supported lanes are not safe to promote:

- Table normalization/header repair is high impact but triggers same-source controls.
- The F row is mixed heading/table/figure route debt without a clean structural discriminator.
- The smaller metadata, link, and near-miss rows do not carry enough independently safe score movement.

Do not add Texas/source/year/PDF-specific gates, scorer masking, PAC relaxation, broader table admission, or heading creation from this evidence. A future table lane would need a stricter object-backed predicate that excludes high-grade table-heavy controls and demonstrates score-moving PAC/table improvement without row-regularity or header-association regressions.

Because no source behavior changed, no original-50 regression validation was required for this source.
