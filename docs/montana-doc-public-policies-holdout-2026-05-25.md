# Montana DOC Public Policies Holdout - 2026-05-25

## Source

- Public source: Montana Department of Corrections policies page.
- Source page: `https://cor.mt.gov/Policy/MSPprocedures`
- Sample: first 20 successfully downloaded core DOC policy PDFs from the public DOC Policies Index after excluding the policy manual, glossary, acronyms, procedure manuals, and stale PDF links returning `404`.
- Size gate: every downloaded PDF was under 10 MiB; all sampled files were about `131 KB` to `212 KB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/montana-doc-policies-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/montana-doc-policies-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `98.5000`
- Median: `99`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `1029ms / 3587ms / 3963ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/montana-doc-policies-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`

There were no rows below `93`; no low-row repeat was needed.

## Decision

This holdout passed without behavior changes. The source met the target mean at `98.5000`, median `99`, with all rows A-grade, fast bounded runtime, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
