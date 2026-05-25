# Massachusetts DOC Restrictive Housing Counts Holdout - 2026-05-25

## Source

- Public source: Massachusetts Department of Correction monthly restrictive housing count reports.
- Current source page: `https://www.mass.gov/lists/doc-monthly-restrictive-housing-counts`
- Archive source page: `https://www.mass.gov/lists/department-of-correction-in-place-archives`
- Sample: latest 20 monthly restrictive-housing report PDFs found across the current and archive pages, covering March 2026 through January 2025 plus December 2024 through July 2024. The current page had no June 2025 PDF when sampled.
- Size gate: every downloaded PDF was under 10 MiB; all sampled files were about `165 KB` to `200 KB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `76.1000`
- Median: `69`
- Grades: `0 A / 9 B / 0 C / 9 D / 2 F`
- Rows below `93`: `20`
- Runtime p50/p95/max: `17761ms / 19975ms / 20247ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `338`

Lane split:

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| `table_target_resolution_needed` | `19` | `304` | Dominant stable table/PDF-UA debt with table markup mostly `44`. |
| `figure_alt_target_discovery_needed` | `1` | `34` | `madocrh-11` had alt debt in the full run; representative repeat recovered it to `87/B`, so it is volatile rather than a clean behavior proof. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `madocrh-01`, `madocrh-10`, `madocrh-11`, `madocrh-14`, `madocrh-20`
- Scores: `69`, `87`, `87`, `87`, `87`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Table Diagnostics

Table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: all 20 sampled rows.
- Unsafe control candidates: none, using `pdfaf_fixture_accessible` as a negative control.
- Prior non-table target rows: none.
- Interpretation: the source has clean object-backed table targets, but this only proves target identity. It does not prove that the existing mutators can repair the table/header debt safely.

Representative table/structure sequence probe:

- Artifact: `/mnt/pdf-review/public-holdouts/massachusetts-doc-monthly-restrictive-housing-2026-05-25/table-sequence-probe-r1/table-structure-sequence-probe.md`
- Probe rows: `madocrh-01`, `madocrh-10`, `madocrh-11`, `madocrh-20`, and `control-accessible`.
- Sequence candidates: `0`
- Harmful PAC regressions: `7`
- No-useful-movement outcomes: `28`
- Best focus outcomes: existing table/structure sequences either stayed at `59/F`, produced no score movement, or caused a harmful non-target PAC regression.

## Decision

No remediation, scorer, planner, analyzer, PAC-gate, timeout, or semantic behavior was accepted from this holdout.

This source is useful stress evidence for the table/header transaction lane: table targets are stable and general, but the current table tools do not produce a safe accepted repair on representative rows. Promoting behavior from target identity alone would repeat prior failed table-heavy holdout patterns and risks PAC-visible regressions, especially `pdfua.table.header_association_present` or orphan-MCID debt. The correct next table work would require a new general transaction proof that repairs table/header debt while preserving PAC invariants; this source alone does not justify broadening the current planner.

Because no source behavior changed, no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
