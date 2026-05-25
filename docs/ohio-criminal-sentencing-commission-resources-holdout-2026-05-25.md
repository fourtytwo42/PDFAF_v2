# Ohio Criminal Sentencing Commission Resources Holdout - 2026-05-25

## Source

- Public source: Ohio Criminal Sentencing Commission resources on the Supreme Court of Ohio site.
- Source page: `https://www.supremecourt.ohio.gov/criminal-br-sentencing/sentencing/`
- Sample: 20 official Criminal Sentencing Commission PDFs, including competency, sentencing, appellate, juvenile, and agency/data reference materials.
- Exclusions: meeting minutes, meeting materials, generic Supreme Court publications, and legislative-update PDFs.
- Size gate: every downloaded PDF was under 10 MiB; the full local sample was about `6.6 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/ohio-criminal-sentencing-commission-resources-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/ohio-criminal-sentencing-commission-resources-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `87.6500`
- Median: `95`
- Grades: `16 A / 0 B / 0 C / 0 D / 4 F`
- Rows below `93`: `5`
- Runtime p50/p95/max: `11389ms / 19335ms / 23853ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/ohio-criminal-sentencing-commission-resources-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for mean `93`: `107`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `ohcsc-02` / Adult Competency Reference Guide | `59/F` | `no_safe_predicate` | Stable `heading_structure=0`; no safe general lane visible from the run artifact. |
| `ohcsc-03` / Adult Rights Restoration | `59/F` | `no_safe_predicate` | Stable `heading_structure=0`; no safe general lane visible from the run artifact. |
| `ohcsc-07` / Felony Sentencing Reference Guide | `59/F` | `no_safe_predicate` | Stable `heading_structure=0`; no safe general lane visible from the run artifact. |
| `ohcsc-15` / Juvenile Competency Reference Guide | `59/F` | `no_safe_predicate` | Stable `heading_structure=0`; no safe general lane visible from the run artifact. |
| `ohcsc-17` / Agency and Data Available Flowchart | `92/A` | `near_miss_monitor` | Low-priority one-point miss. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/ohio-criminal-sentencing-commission-resources-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `ohcsc-02`, `ohcsc-03`, `ohcsc-07`, `ohcsc-15`, `ohcsc-17`
- Scores: `59`, `59`, `59`, `59`, `92`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout is diagnostic-only. It did not meet the source target mean of `93`, and the four high-impact lows are repeat-supported, but the evidence is not safe enough for a behavior change:

- The main residual is stable zero-heading debt on short reference-guide PDFs.
- The run artifact does not expose an object-backed heading target or a safe general predicate.
- Prior report-layout heading recovery predicates were intentionally report-scale; broadening them to short reference guides from this evidence would be source-pattern fitting.
- The near miss needs only one point and is not worth a separate behavior lane.

No source behavior changed, so no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
