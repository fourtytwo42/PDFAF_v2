# Table MCID Traversal Stability Parked - 2026-05-28

## Summary

This diagnostic checked whether table-heavy outside-source side-effect evidence was being distorted by nondeterministic orphan-MCID traversal. The signal is real: on Montana Courts table lows, direct Python analysis of the same PDF produced inconsistent `orphanMcids` and `taggedContentAudit.orphanMcidCount` values when structure traversal de-duplicated nodes by Python wrapper `id()`.

A production candidate that de-duplicated structure nodes by stable indirect object identity made the Montana orphan signal deterministic, but it did not pass the original-50 acceptance gate. The candidate was reverted before commit.

No production remediation behavior, scoring rule, PAC gate, table admission, source gate, filename gate, row gate, hash gate, ODL/PAC/POC runtime dependency, semantic behavior, or generated PDF artifact is kept from this diagnostic.

## Local Evidence

Scratch root:

`/mnt/pdf-review/pdfaf-table-goal-work-2026-05-28-r1`

The local scratch PDFs and generated validation artifacts were deleted after the metrics below were extracted.

Direct repeated Python analysis on `mtcourts-05` and `mtcourts-09` showed the baseline orphan-MCID collector was not stable. With stable object-key traversal, both rows consistently reported:

- `orphanMcids.length = 16`
- `taggedContentAudit.orphanMcidCount = 16`

The diagnostic missing-header batch probe with the stable traversal candidate changed the table side-effect classification:

- Report: `/mnt/pdf-review/pdfaf-table-goal-work-2026-05-28-r1/missing-header-probe-stable-mcid-r1/table-parent-ownership-probe.md`
- `mtcourts-05`: `55/F -> 59/F`, table `0 -> 26`, orphan `16 -> 16`
- `mtcourts-09`: `55/F -> 59/F`, table `0 -> 26`, orphan `16 -> 16`
- `mtcourts-01` control: no table movement
- Classification: two clean table-progress rows, zero ownership-regression rows

Bounded Montana validation with the candidate did not move the normal engine past the current plateau:

- Report: `/mnt/pdf-review/pdfaf-table-goal-work-2026-05-28-r1/current-stable-mcid-run-r1/baseline_report.json`
- Count: `3/3`
- Mean after: `91.00`
- `mtcourts-01`: `60/D -> 95/A`
- `mtcourts-05`: `55/F -> 89/B`
- `mtcourts-09`: `55/F -> 89/B`
- `false_positive_applied=0`

Focused tests passed with the candidate:

```bash
npx -y node@22 /usr/bin/pnpm exec vitest run \
  tests/threecc/goldenAnalysis.test.ts \
  tests/integration/tableNormalization.integration.test.ts \
  tests/remediation/stage180MixedTablePdfua.test.ts \
  tests/benchmark/tableParentOwnershipProbe.test.ts
```

Lint passed:

```bash
npx -y node@22 /usr/bin/pnpm run lint
```

## Original-50 Gate

Original-50 deterministic validation with the candidate did not pass the accepted floor:

- Report: `/mnt/pdf-review/pdfaf-validation/original50-stable-mcid-traversal-2026-05-28-r1/baseline_report.json`
- Count: `50/50`
- Mean after: `94.00`
- Accepted floor for this goal: mean `94.24`, median `95`, `false_positive_applied=0`, no hard timeouts
- `false_positive_applied=0`
- Hard timeouts/errors: `0`
- p95/max runtime: about `162845ms / 269710ms`

Rows below `93`:

- `4076`: `90/A`
- `4207`: `59/F`
- `4438`: `69/D`
- `4516`: `69/D`

Focused repeat of the low rows:

- Report: `/mnt/pdf-review/pdfaf-validation/original50-stable-mcid-focus-low-2026-05-28-r1/baseline_report.json`
- `4076`: `90/A`
- `4207`: `59/F`
- `4438`: `69/D`
- `4516`: `86/B`
- `false_positive_applied=0`

The repeated `4207` and `4438` lows mean the original-50 regression cannot be dismissed as a single-run artifact.

## Decision

Decision: `park_stable_mcid_traversal_as_diagnostic_only`.

Reasons:

- The candidate corrects a real nondeterministic analyzer signal and removes false-looking Montana table ownership regressions.
- It does not produce a new score-moving table transaction; Montana rows still stop at `89/B` in normal remediation.
- It repeatedly drops original-50 rows under the current accepted gate, especially `4207` and `4438`.
- The active table-heavy goal does not allow accepting an original-50 mean regression without explicit acceptance.

## Next Work

Do not reintroduce stable object-key MCID traversal as default production behavior without a separate PAC/POC alignment plan that explicitly accepts stricter original-50 scoring or pairs the stricter evidence with safe remediation for the newly exposed debt.

The next table-heavy lane should stay object-backed and target final table/header cleanup after the current accepted table repairs. Montana-style missing-header rows are no longer proven blocked by non-table side effects under the stable diagnostic, but they still need a general cleanup step that lifts `89/B` to A-grade without changing original-control outcomes.
