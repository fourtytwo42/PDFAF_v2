# Original-50 Single-Analysis Benchmark Candidate Parked

Date: 2026-05-29

## Summary

A local benchmark-only experiment reused the already-computed `runAnalyzeStep`
snapshot as remediation input instead of running a second pre-remediation
`analyzePdf` call. The experiment was intended to test whether original-50
route volatility on `long-4680` and `long-4683` was caused primarily by a
same-run mismatch between benchmark analysis and remediation-entry analysis.

The candidate is parked and was not kept in source. It removed the
analysis-to-remediation-entry mismatch in the focused provenance diagnostic, but
it did not improve either row and did not solve final reanalysis volatility.

## Local Evidence

- Candidate run:
  `/mnt/pdf-review/original50-single-analysis-candidate-2026-05-29-r1/run-2026-05-29T19-25-33-755Z`
- Provenance diagnostic:
  `/mnt/pdf-review/pdfaf-validation/original50-single-analysis-candidate-provenance-2026-05-29-r1/original50-analysis-remediation-provenance-diagnostic.md`
- Mode: `full`
- Selected rows: `long-4680`, `long-4683`
- Semantic: disabled
- PDF output: disabled

## Result

The focused candidate completed both rows without hard errors:

| Row | Before | After | Final reanalysis | Provenance class |
| --- | ---: | ---: | ---: | --- |
| `long-4680` | `59/F` | `59/F` | `59/F` | `stable_low_no_entry_variance` |
| `long-4683` | `59/F` | `59/F` | `52/F` | `stable_low_no_entry_variance` |

The provenance diagnostic changed from
`analysis_to_remediation_initial_variance` to
`stable_low_no_entry_variance` for both rows, which confirms the benchmark
plumbing experiment removed the entry mismatch. However, the run still had no
score lift, and `long-4683` still collapsed during final reanalysis.

## Decision

Do not accept the single-analysis benchmark path as an original-50 stabilizer.
It may be relevant later as an API/benchmark parity discussion, but by itself it
does not satisfy the active gate-stabilization objective because it leaves the
same low rows below the accepted floor and preserves final analyzer variance.

The source experiment was reverted before commit. The next useful lane is a
native final-reanalysis/analyzer-repeat diagnostic for `long-4680`,
`long-4683`, and related original-50 route-drop rows, not a benchmark-only
change and not a table behavior change.
