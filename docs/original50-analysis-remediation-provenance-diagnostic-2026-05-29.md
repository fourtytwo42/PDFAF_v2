# Original-50 Analysis/Remediation Provenance Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-analysis-remediation-provenance-diagnostic.ts`, a read-only diagnostic that compares the benchmark `analyze.results.json` snapshot against the first remediation replay-state payload for the same row and same run.

This matters because the latest original-50 blockers are not only drifting across separate full runs. For `4680` and `4683`, the analyzer snapshot produced during the benchmark analyze phase can disagree with the analyzer snapshot used as remediation entry state in the same deterministic run.

The script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call ODL/PAC/POC/Java/LLM, or change production behavior.

Source:

- `scripts/original50-analysis-remediation-provenance-diagnostic.ts`
- `tests/scripts/original50AnalysisRemediationProvenanceDiagnostic.test.ts`

Local report:

- `/mnt/pdf-review/pdfaf-validation/original50-analysis-remediation-provenance-2026-05-29-r2/original50-analysis-remediation-provenance-diagnostic.md`

## Fresh Repeat

Ran a small deterministic repeat over only:

- `long-4680`
- `long-4683`

Command shape:

- Node 22
- `--mode full`
- `--no-semantic`
- no `--write-pdfs`

Run directory:

- `/mnt/pdf-review/original50-upstream-repeat-2026-05-29-r1/run-2026-05-29T19-15-10-378Z`

Result:

| Row | Result | Runtime |
| --- | ---: | ---: |
| `long-4680` | `59/F -> 59/F` | `~32.7s` |
| `long-4683` | `59/F -> 59/F` | `~35.1s` |

No broad original-50 gate was run. No semantic work was enabled.

## Diagnostic Inputs

Compared three deterministic run directories:

- `current`: `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z`
- `repeat`: `/mnt/pdf-review/original50-initial-route-repeat-2026-05-29-r1/run-2026-05-29T18-48-39-015Z`
- `upstream-r1`: `/mnt/pdf-review/original50-upstream-repeat-2026-05-29-r1/run-2026-05-29T19-15-10-378Z`

## Decision

Decision: `diagnose_analyzer_remediation_entry_variance_before_behavior`

Next lane: `native_analyzer_or_remediation_entry_snapshot_stability`

Both selected rows classify as `analysis_to_remediation_initial_variance`.

## Row Findings

### `4680`

All three current low observations stayed at `59/F`.

The same-run analyze snapshot and first remediation replay state disagree:

- current/repeat analyze table score is `92`, while first remediation replay table score is `79`;
- upstream-r1 analyze shape has `heading_structure=95`, `reading_order=96`, and only `1` extracted heading / `3` extracted figures;
- upstream-r1 remediation entry shape returns to `heading_structure=60`, `reading_order=100`, `19` extracted headings, and `10` extracted figures.

This row is not a table-admission problem yet. The remediation entry analyzer state is not stable enough to use as an acceptance gate for later table work.

### `4683`

All three current low observations stayed below target.

The same-run analyze snapshot and first remediation replay state also disagree:

- current analyze shape: `heading_structure=99`, `reading_order=96`, `1` extracted heading, `5` extracted figures;
- current remediation entry shape: `heading_structure=43`, `reading_order=100`, `22` extracted headings, `15` extracted figures;
- upstream-r1 analyze shape: low table/heading state (`heading_structure=43`, `table_markup=6`);
- upstream-r1 remediation entry shape: high table/heading entry (`heading_structure=78`, `table_markup=100`, `reading_order=96`) with `0` extracted headings and `3` extracted figures.

This explains why metadata-stage outcomes can look contradictory in replay reports: the row is entering remediation from different analyzer shapes before behavior-specific tools have a stable target.

## Interpretation

Do not reopen parked table-heavy outside-source lanes from this evidence.

Do not add:

- table admission changes;
- scorer masking;
- PAC/category guard weakening;
- source/file/row/hash gates;
- broad replay-signature pruning;
- behavior based on rejected high states.

The next useful implementation work should diagnose or stabilize the boundary between benchmark analysis and remediation entry analysis. If that boundary cannot be made generally stable without lowering strictness, `4680` and `4683` should be parked with source-tracked no-safe-general-fix evidence before table lanes reopen.

## Validation

Focused test:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/scripts/original50AnalysisRemediationProvenanceDiagnostic.test.ts`

Result:

- `3` tests passed.
