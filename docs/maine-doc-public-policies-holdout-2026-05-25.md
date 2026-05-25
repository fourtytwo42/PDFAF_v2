# Maine DOC Public Policies Holdout - 2026-05-25

## Source

- Public source: Maine Department of Corrections Policies and Rules page.
- Source page: `https://www.maine.gov/corrections/policies/`
- Sample: first 20 Department Wide policy PDFs from the public policy table, starting with policy `01.01` and excluding rulemaking forms, adopted-rule material, and attachment-only PDFs.
- Size gate: every downloaded PDF was under 10 MiB; the largest sampled file was about `0.51 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/maine-doc-policies-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/maine-doc-policies-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `93.2500`
- Median: `95`
- Grades: `19 A / 0 B / 0 C / 0 D / 1 F`
- Rows below `93`: `3`
- Runtime p50/p95/max: `8599ms / 13069ms / 16516ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/maine-doc-policies-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended residual lane: `figure_alt_target_discovery_needed`
- Raw points needed for mean `93`: `0`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `medocpol-16` / Communication and Collaboration With Outside Agencies | `59/F` | `figure_alt_target_discovery_needed` | Major residual alt debt in the full run; repeat recovered to `90/A`, so treat as volatile residual evidence, not a behavior proof. |
| `medocpol-04` / Monitoring of Departmental Programs and Services | `92/A` | `near_miss_monitor` | Low-priority table/heading near miss; repeated at `92/A`. |
| `medocpol-08` / Developing, Implementing, and Revising Departmental Policies | `92/A` | `near_miss_monitor` | Repeated lower at `69/D`, indicating table/route volatility rather than a clean target. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/maine-doc-policies-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `medocpol-04`, `medocpol-08`, `medocpol-16`
- Scores: `92`, `69`, `90`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout passed without behavior changes. The source met the target mean at `93.2500`, median `95`, with fast bounded runtime, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The residual figure/alt and table/route volatility should remain diagnostic-only unless a later source produces a general object-backed predicate with stable positives and controls. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
