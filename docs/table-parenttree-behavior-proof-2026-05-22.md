# Table/ParentTree Behavior Proof

Date: 2026-05-22

## Decision

Decision: `accept_report_scale_object_backed_table_proof`.

This accepts a narrow native table behavior proof. It does not accept broad dense row-band routing, layout-only table promotion, scorer caps, PAC relaxation, checker masking, ODL/PAC/POC runtime calls, or source/PDF-specific gates.

## Source Change

The accepted behavior adds a report-scale object-backed predicate for existing Stage180 table cleanup:

- `shouldTryStage180ReportTableProof` requires low table score, stable alt/reading/link evidence, bounded heading debt, no annotation debt, heavy native table header-association debt, no direct/misplaced table shape, report-scale page count, and at least one stable `/Table` target with enough rows/cells/headers/subtree MCIDs.
- The remediation orchestrator may run the existing `stage180_header_regularization_sequence` when that predicate is true, even when heading structure is in the bounded `60-69` range.
- The change uses only existing table tools: `normalize_table_structure` and `set_table_header_cells`.

The predicate is structural and native. It is not based on filenames, row IDs, source names, paths, hashes, benchmark membership, ODL, PAC, or Research/POC runtime calls.

## Validation

Primary target/control run:

- `/mnt/pdf-review/pdfaf-validation/table-parenttree-behavior-proof-2026-05-22-r1/run-r2-original-names/baseline_report.json`
- `11/11` completed
- Mean: `50.8182 -> 94.8182`
- `false_positive_applied=0`
- Timeouts/errors: `0`
- Runtime p95/max: `209066ms / 209066ms`

The earlier `run-r1` is superseded because it used shortened symlink names. `run-r2-original-names` preserved original basenames.

Target behavior:

- `va-15`: `54/F -> 96/A`; new Stage180 table sequence fired at `69 -> 86`, then existing cleanup finished the row. The table operation reduced irregular table evidence and applied repeated header-association batches against stable object-backed table targets.
- `va-17`: `54/F -> 91/A`; existing Stage180 route still applies and stays stable.
- `va-11`: `51/F -> 94/A`; no new report-scale Stage180 proof trigger was needed in this run.

Full Virginia outside-holdout rerun after acceptance:

- `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-current-table-proof-full-2026-05-22-r1/baseline_report.json`
- `20/20` completed
- Mean: `48.25 -> 95.10`
- Median: `95.5`
- `false_positive_applied=0`
- Timeouts/errors: `0`
- Runtime p95/max: `202448ms / 212140ms`
- Compared with the previous Virginia checkpoint, mean improved `93.35 -> 95.10` and p95 stayed within the bounded allowance (`199055ms` reference, `205027ms` allowed).

The remaining below-93 Virginia rows are `va-03 87/B` and `va-17 91/A`. They are not table proof regressions; `va-17` still runs the existing Stage180 table sequence and remains near target.

Controls and blockers:

- Controls stayed stable: `ADAM2 94/A`, Teams remediated `96/A`, Teams targeted `95/A`, Teams original `98/A`, and `pdfaf_fixture_accessible 96/A`.
- Dense/layout blockers stayed out of the new predicate: `va-08 97/A`, `va-09 93/A`, and `va-10 93/A` did not schedule the report-scale Stage180 admission.

Original-50 deterministic validation:

- `/mnt/pdf-review/pdfaf-validation/original50-table-parenttree-proof-2026-05-22-r1/baseline_report.json`
- `49/50` completed
- Completed-row mean: `95.2041`
- All-row mean: `93.3000`
- `false_positive_applied=0`
- Timeouts/errors: `1`, the known `4438` hard-tail row
- Runtime p95/max: `226899ms / 300036ms`

Compared with the prior original-50 checkpoint `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`, p95 did not regress (`229628ms -> 226899ms`). The only Stage180 row in original-50 was the existing `4057` table route; the new report-scale predicate did not spill into the controls or unrelated original-50 rows.

## Remaining Parked Debt

The broader dense-table lane remains parked.

- `va-08`, `va-09`, and `va-10` are still negative examples for dense row-band routing because prior planned table targets resolved as non-table roles.
- Layout table evidence remains supporting/diagnostic evidence only unless a future proof shows stable object-backed `/Table` refs immediately before mutation.
- All-unique validation has not been rerun from this change. Track it separately before claiming broad all-input progress.

## Acceptance Rationale

This proof moves PDFAF closer to PAC-style table/header remediation because it requires native object-backed table evidence and reduces real table/header debt without suppressing failures. The original-50 gate preserves mutation truth, avoids a new hard timeout, and shows no p95 regression.

Future table work should start from this accepted predicate and only broaden when a new structural subtype has the same level of object-backed evidence, controls, and broad validation.
