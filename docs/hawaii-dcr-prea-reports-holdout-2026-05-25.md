# Hawaii DCR PREA Reports Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using official Hawaii Department of Corrections and Rehabilitation PREA PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://dcr.hawaii.gov/policies-and-procedures/pp-prea/`
- Sample: first 20 facility PREA audit report PDFs on the source page, from `KCCC 10-01-2015` through `WCCC 09-02-2020`
- Size gate: all sampled PDFs were under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/hawaii-dcr-prea-reports-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `38.05 -> 87.95`
- Median: `38 -> 93`
- Minimum final score: `68`
- Grades after remediation: `15 A / 0 B / 0 C / 5 D / 0 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `30084ms / 44051ms / 44340ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Score | Class |
| --- | ---: | --- |
| `hidcrprea-17.pdf` | `68/D` | `table_target_resolution_needed` |
| `hidcrprea-02.pdf` | `69/D` | `table_target_resolution_needed` |
| `hidcrprea-04.pdf` | `69/D` | `table_target_resolution_needed` |
| `hidcrprea-08.pdf` | `69/D` | `table_target_resolution_needed` |
| `hidcrprea-09.pdf` | `69/D` | `table_target_resolution_needed` |
| `hidcrprea-07.pdf` | `91/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/hawaii-dcr-prea-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `101`

Focused table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/hawaii-dcr-prea-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `hidcrprea-02`, `hidcrprea-04`, `hidcrprea-08`, `hidcrprea-09`, `hidcrprea-17`
- Unsafe control candidate: `hidcrprea-03`
- Prior non-table target rows: none

The table lane stayed diagnostic-only. The low rows do have stable object-backed table targets, but the same-source A-grade control `hidcrprea-03` also matches the stable normalize-target shape. This repeats the broader PREA pattern: table/header debt is real and high-impact, but the current native predicate is not selective enough to promote behavior safely without risking controls.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The holdout mean remains below `93`, but the actionable signal is concentrated in PAC-like table/header association debt.
- Existing table tools already expose much of this lane; unresolved debt is final table/header correctness, not a safe missing broad scheduler.
- A same-source control triggers the stable table-target predicate, so broad admission would be overbroad.
- `false_positive_applied` stayed `0`, and there were no timeouts or runtime regressions.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and should be deleted after this diagnostic set is documented.
