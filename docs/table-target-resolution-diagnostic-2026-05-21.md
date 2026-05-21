# Table Target Resolution Diagnostic

Date: 2026-05-21

This diagnostic follows the parked table-header transaction behavior proof. It is diagnostic-only: it runs native PDFAF analysis, reads the prior behavior-proof JSON, and does not call ODL/PAC/POC, route remediation, mutate PDFs, or write remediated PDFs.

## Artifacts

- Source script: `scripts/table-target-resolution-diagnostic.ts`
- Local report: `/mnt/pdf-review/pdfaf-table-diagnostics/table-target-resolution-2026-05-21-r1/table-target-resolution-diagnostic.md`
- Local JSON: `/mnt/pdf-review/pdfaf-table-diagnostics/table-target-resolution-2026-05-21-r1/table-target-resolution-diagnostic.json`
- Prior behavior proof input: `/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/run-r1/remediate.results.json`
- Manifest: `/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/manifest.json`

## Result

Decision: `keep_table_target_resolution_diagnostic_only`.

The run inspected 9 rows:

| classification | count |
| --- | ---: |
| `control_or_high_grade_noise` | 5 |
| `non_table_target_attempt` | 3 |
| `stable_header_assoc_target` | 1 |

Stable focus candidate:

- `va-11`

Rows parked by prior non-table target resolution:

- `va-08`: old `normalize_table_structure` target `1995_0` resolved as `/TD`
- `va-09`: old `normalize_table_structure` target `584_0` resolved as `/Figure`
- `va-10`: old `normalize_table_structure` target `548_0` resolved as `/Figure`

Controls:

- `fixture-adam2`, three Teams controls, and `fixture-accessible` did not become behavior candidates.
- `fixture-accessible` still has table-like residual evidence, but it is an A-grade control and remains excluded from promotion.

## Decision Rationale

The table/header lane still has real PAC-style evidence, but it does not yet have enough object-backed behavior proof:

- Only one focus row (`va-11`) has a previously accepted stable `/Table` header-association repair.
- The three dense-table positives (`va-08`, `va-09`, `va-10`) have real native layout/table debt, but the prior behavior proof selected refs that resolved to non-table roles at mutation time.
- Promoting behavior from layout/dense row-band evidence alone would repeat the failure mode that the prior proof exposed.

No planner, scorer, PAC gate, or Python mutator behavior was changed.

## Next Step

Do not promote the current dense row-band table transaction predicate. A future table attempt would need a separate target-selection proof that:

- verifies the selected ref resolves as `/Table` immediately before mutation;
- rejects non-table refs instead of falling back;
- proves at least two positive rows get accepted table/PAC debt reduction;
- keeps `fixture-accessible` and the Teams/ADAM controls stable.

Until that proof exists, move to another PAC/POC parity lane with cleaner object-backed evidence.
