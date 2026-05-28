# Table Residual Regularity Side-Effect Parked

Date: 2026-05-28

## Summary

The Montana-style residual table regularity lane remains a real opportunity, but the attempted behavior proof is parked. The behavior was not kept in source.

The tested variants were general and object-backed:

- strict final cleanup of residual real `/Table` refs with row-regularity debt;
- an empty-row-only deletion variant;
- an empty-row preservation/padding variant;
- no filename, row ID, source, corpus, hash, ODL, PAC, POC, Java, semantic, or LLM dependency.

## Evidence

Local scratch artifacts, removed after metrics extraction:

- `/mnt/pdf-review/pdfaf-table-diagnostics/table-empty-row-strict-proof-2026-05-28-r1/run-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-table-diagnostics/table-empty-row-strict-proof-2026-05-28-r1/montana-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-table-diagnostics/table-empty-row-pad-proof-2026-05-28-r1/montana-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-table-diagnostics/table-residual-regularity-strict-proof-2026-05-28-r1/montana-repeat-r1/baseline_report.json`

Key observations:

- The strict empty-row deletion variant can lift a Montana row to `95/A`, but not repeatably:
  - compact proof: `mtcourts-09 95/A`, `mtcourts-05 69/D`;
  - focused repeat: `mtcourts-05 95/A`, `mtcourts-09 89/B`.
- Guarded reanalysis correctly rejected some table-normalization attempts because the candidate final state introduced `pdfua.content.orphan_mcids_absent` or structural-confidence/PDF-UA regression evidence.
- The preservation/padding variant did not solve the problem:
  - focused repeat: `mtcourts-05 89/B`, `mtcourts-09 87/B`.
- The broader strict residual regularity selector also did not solve it:
  - focused repeat: `mtcourts-05 89/B`, `mtcourts-09 89/B`.
- U.S. Courts lows remain mixed heading/table rows, not table-only proof targets:
  - `uscourts-01` keeps `heading_structure=0` and `table_markup=0`;
  - `uscourts-04` keeps `heading_structure=0` even when table improves.

## Decision

Decision: `park_residual_table_regularity_behavior`.

Do not promote final residual table regularity cleanup yet. The target predicate is structural and promising, but the current mutator path does not repeatably preserve non-table PAC evidence. The right next blocker is table-side-effect cleanup / analyzer stability for table normalization, not broader table admission.

## Next Safe Work

- Diagnose why removing or regularizing residual empty/irregular table rows can create orphan-MCID/PDF-UA regression evidence on one repeat and not another.
- Prefer a preservation fix inside Python table normalization if one can prove the affected MCIDs/ParentTree entries remain owned.
- Keep U.S. Courts rows parked as mixed heading/table debt unless a separate heading-backed predicate is opened.
- Do not run original-50 for this parked behavior because no production behavior was kept.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/stage180MixedTablePdfua.test.ts tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`
- targeted deterministic bounded validations listed above, all with `--no-semantic --no-pdfs` and `false_positive_applied=0`
