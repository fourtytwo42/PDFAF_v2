# Vermont DOC Public Policies Holdout - 2026-05-25

## Source

- Public source: Vermont Department of Corrections public policy library.
- Source page: `https://outside.vermont.gov/dept/doc/policies/forms/public%20facing%20view.aspx`
- Sample: first 20 public-facing policy, directive, guidance, and standard operating procedure PDFs from the DOC policy library after excluding form-only entries.
- Size gate: every downloaded PDF was under 10 MiB; the full local sample was about `3.1 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/vermont-doc-public-policies-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/vermont-doc-public-policies-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `93.5500`
- Median: `94`
- Grades: `19 A / 0 B / 0 C / 1 D / 0 F`
- Rows below `93`: `3`
- Runtime p50/p95/max: `9334ms / 12685ms / 13055ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/vermont-doc-public-policies-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended residual lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `vtdocpol-07` / Staff Training Policy | `69/D` | `table_target_resolution_needed` | Stable table/PDF-UA debt; source already passed, so no behavior promotion was required. |
| `vtdocpol-18` / Hiring Managers Checklist Guidance | `90/A` | `near_miss_monitor` | Low-priority near miss. |
| `vtdocpol-11` / Peer Support and Workforce Resiliency Policy | `92/A` | `near_miss_monitor` | Repeated lower at `89/B`, indicating route/state volatility; still low priority because source target was met. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/vermont-doc-public-policies-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `vtdocpol-07`, `vtdocpol-11`, `vtdocpol-18`
- Scores: `69`, `89`, `90`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout passed without behavior changes. The source met the target mean at `93.5500` with fast runtime and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The residual `vtdocpol-07` table debt is useful future table-target evidence, but it is only one row and does not justify a behavior lane by itself. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
