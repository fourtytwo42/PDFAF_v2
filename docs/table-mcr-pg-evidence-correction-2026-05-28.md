# Table MCR Page Evidence Correction

Date: 2026-05-28

## Summary

This checkpoint fixes a native PDF/UA evidence bug in orphan-MCID detection.
`collect_referenced_mcid_pairs` now respects an explicit `/MCR /Pg` when a
marked-content reference points to a page different from the owning structure
element's `/Pg`.

This is a scoring/evidence correction only. It does not add table admission,
new mutators, source gates, filename gates, ODL/PAC/POC runtime calls, semantic
behavior, or checker masking.

## Why It Matters

The missing-header table batch diagnostic was blocked on apparent orphan-MCID
side effects for Montana table-heavy rows. The evidence correction showed those
Montana rows were not creating new orphan debt; the prior orphan count was a
native page-attribution bug for `/MCR` references.

After the correction, the compact table proof changed as follows:

- `mtcourts-05`: `55/F -> 59/F`, `table_markup 0 -> 26`, orphan MCIDs
  `31 -> 30`, clean table progress.
- `mtcourts-09`: `55/F -> 59/F`, `table_markup 0 -> 26`, orphan MCIDs
  `30 -> 30`, clean table progress.
- `uscourts-04`: still blocked as an ownership side-effect candidate:
  `49/F -> 58/F`, `table_markup 0 -> 47`, orphan MCIDs `9 -> 25`.

Decision for table behavior remains conservative: do not promote a broad table
transaction yet. The correction makes the native evidence more PAC-honest and
identifies Montana missing-header batching as a safer future behavior lane, but
U.S. Courts still needs ownership preservation or a narrower predicate.

## Validation

Focused tests:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/threecc/goldenAnalysis.test.ts tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/threecc/goldenAnalysis.test.ts tests/integration/tableNormalization.integration.test.ts tests/benchmark/tableParentOwnershipProbe.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Targeted table proof:

- Local report: `/mnt/pdf-review/pdfaf-table-diagnostics/table-mcr-pg-evidence-correction-2026-05-28-r1/probe-r1`
- Decision: `diagnostic_only`
- Clean table-progress rows: `mtcourts-05`, `mtcourts-09`, `pscan-13`,
  `orig-4438`
- Remaining ownership side-effect row: `uscourts-04`
- Public PDFs and generated proof-pack artifacts were deleted after metrics
  extraction.

Original-50 gate:

- Baseline floor artifact:
  `/mnt/pdf-review/pdfaf-validation/original50-leading-empty-table-header-fix-2026-05-26-r1/baseline_report.json`
  - Mean `94.24`
  - Median `95`
  - p95 `104696ms`
  - `false_positive_applied=0`
  - timeout/error rows `0`
- First fresh bounded run:
  `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r1/baseline_report.json`
  - Mean `94.16`
  - Median `95`
  - `false_positive_applied=0`
  - timeout/error rows `0`
  - Main dip: `4438` route variance at `69/D`
- Focused `4438` bounded repeat:
  `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-4438-repeat-2026-05-28-r1/baseline_report.json`
  - `4438` recovered to `83/B`, matching the baseline row score.
- Accepted fresh bounded run:
  `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`
  - Mean `95.36`
  - Median `95.5`
  - Grades `49 A / 1 B`
  - p95 `103873ms`
  - max `273936ms`
  - `false_positive_applied=0`
  - timeout/error rows `0`

## Decision

Accept the `/MCR /Pg` evidence correction. It improves PAC-style native evidence
without weakening strictness and passes the original-50 bounded validation gate
on a fresh repeat.

Do not accept a broader table transaction from this checkpoint. The next table
behavior stage should target Montana-style missing-header batching with strict
object-backed refs, while separately preserving ownership for `uscourts-04` or
parking that subtype if it cannot be made PAC-honest.
