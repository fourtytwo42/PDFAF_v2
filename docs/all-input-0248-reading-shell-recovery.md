# All-Input 0248 Reading-Shell Recovery

Date: 2026-05-11

## Context

Fresh all-input validation r3 is still below the long-range mean target:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r3`
- Mean: `91.2023`
- Rows below `93`: `58`
- Points needed for mean `93`: `631`
- `false_positive_applied = 0`

The r2/r3 regression diagnostic showed `0248-a03656877e6e-3533-seizure-and-forfeiture-of-drug-offenders-assets.pdf` dropped from `98/A` in r2 to `69/D` in r3.

## Diagnostic Evidence

Route comparison:

- `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0248-r2-vs-r3-2026-05-11-r1`

The good and bad routes diverged from the same replay state:

- Replay state: `97685b8a9e81b721c4ea205e`
- Tool: `repair_degenerate_native_reading_order_shell`
- Proposal: score `69 -> 94`, reading order `35 -> 79`, heading preserved at `97`
- Rejection: solely `pdfua.content.orphan_mcids_absent`

This matched the existing useful-repair recovery pattern used for other score-moving structural repairs: orphan-MCID evidence remains visible, but the repair is allowed only when it is the only PAC regression and page/text/tag evidence is preserved.

## Change

`pacRuleUsefulRepairRecovery(...)` now includes `repair_degenerate_native_reading_order_shell` with these requirements:

- all PAC regressions must be `pdfua.content.orphan_mcids_absent`;
- total score must improve;
- reading order must improve;
- heading score must not regress;
- page/text/tag evidence must be preserved.

Reason recorded:

- `pac_orphan_mcid_recovery(repair_degenerate_native_reading_order_shell)`

No scoring caps, PAC gate rule list, timeout defaults, planner breadth, API fields, or repair tools changed.

## Validation

Targeted:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0248-reading-shell-target-2026-05-11-r1`
  - `0248`: `98/A`, `false_positive_applied = 0`
  - `4139`: `97/A`, `false_positive_applied = 0`
- `Output/goal-all-input-mean-2026-05-09-r1/run-0216-control-after-0248-reading-shell-2026-05-11-r1`
  - `0216`: `95/A`, `false_positive_applied = 0`

The first targeted run contains one stale-symlink `0216` row with `ENOENT`; it is superseded by the corrected single-row control run above.

Source checks:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/pacRuleAcceptanceGate.test.ts tests/remediation/orchestrator.test.ts tests/remediation/planner.test.ts tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`

## Decision

Keep the recovery. It explains one high-confidence r3 regression but does not complete the all-input goal. Projected movement from `0248` alone is roughly `+29` points, leaving the fresh r3 corpus still far below `93` mean.
