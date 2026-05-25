# Indiana CJI Research Reports Holdout - 2026-05-25

## Source

- Public source: Indiana Criminal Justice Institute research reports.
- Source page: `https://www.in.gov/cji/research/home/`
- Sample: 20 official PDFs across Status of the Criminal Justice System, Criminal Code Reform / HEA 1006, Juveniles Under Adult Court Jurisdiction, and Bail / Pretrial / Rearrest report families.
- Size gate: every downloaded PDF was under 10 MiB; largest file was about `6.7 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/indiana-cji-research-reports-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/indiana-cji-research-reports-2026-05-25/run-r1/baseline_report.json`
- Completed: `19/20`
- Mean after completed rows: `86.9474`
- Mean after all rows: `82.6000`
- Median after all rows: `94.5`
- Grades after all rows: `12 A / 1 B / 0 C / 6 D / 1 timeout`
- Rows below `93`: `9`
- Runtime p50/p95/max: `35221ms / 266609ms / 300035ms`
- Hard timeouts/errors: `1`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/indiana-cji-research-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `208`

Lane distribution:

| Class | Rows | Raw Points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | `6` | `126` |
| `timeout_or_error` | `1` | `93` |
| `table_object_candidate` | `1` | `31` |
| `near_miss_monitor` | `1` | `1` |

Table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/indiana-cji-research-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `incji-01`, `incji-02`, `incji-04`, `incji-05`, `incji-09`, `incji-15`
- Unsafe control candidates: `incji-06`, `incji-12`, `incji-14`, `incji-16`
- Prior non-table target rows: `incji-07`, `incji-10`, `incji-11`

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/indiana-cji-research-reports-2026-05-25/low-repeat-r1/baseline_report.json`
- Completed: `8/9`
- Scores: `69`, `69`, `69`, `69`, `69`, `timeout`, `62`, `87`, `92`
- Reproduced timeout: `incji-08`
- `false_positive_applied`: `0`

## Decision

This holdout is diagnostic-only. It is a useful outside-corpus stress source, but no general behavior change is accepted from this pass:

- The main low cluster is stable and table/PAC-related, but high-scoring same-source controls trigger the same stable table target classes.
- Several high-scoring controls have prior non-table table-target attempts, which makes broad table admission unsafe.
- `incji-08` reproduced the hard `300000ms` timeout and should be treated as runtime/analyzer debt, not as score movement.
- The source remains far below the `93` source target, but the current evidence does not isolate a safe general predicate that would improve targets while preserving controls.

No source behavior changed, so no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
