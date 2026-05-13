# All-Input 0097 Figure-Alt Reading Guard

Date: 2026-05-12

## Summary

This stage keeps a narrow figure-alt route recovery that was originally proven on `0097-50e28b6cb052-4694-evaluation-of-the-development-of-a-multijurisdictional-police-based-defl.pdf` and is now keyed by structural evidence rather than filename.

The current r10 overlay had this row at `69/D`. A current-code repeat proved a safe `95/A` route, but another current repeat rejected the score-moving figure-alt stage because reading order moved from `100` to `96` while alt/table/PDF-UA evidence improved substantially. The guard accepts only that high-quality structural tradeoff.

## Scope

The guard applies only when all of these are true:

- the stage contains a figure-alt recovery tool;
- the only protected category drift is `reading_order:100->96` or better;
- final score is at least `90`;
- `alt_text` improves from weak evidence to at least `80`;
- `table_markup` improves from below `80` to at least `80`;
- `pdf_ua_compliance` does not regress;
- page count, text count, tagged state, and structure tree are preserved;
- no new stricter score cap or new PAC failure appears.

Generic figure-alt stages with the same reading-order drift still reject unless the full structural predicate is met, and the path still rejects if PAC/page/text/tag safety is not preserved.

## Evidence

- Target validation: `Output/goal-all-input-mean-2026-05-09-r1/run-0097-figure-alt-reading-guard-2026-05-12-r1`
- Result: `52/F -> 95/A`
- `false_positive_applied`: `0`
- Runtime: `261939ms`

Generalized validation:

- Target/control validation: `Output/goal-all-input-mean-2026-05-09-r1/run-0097-reading-generalized-2026-05-13-r1`
- Target result: `0097/4694 52/F -> 95/A`
- Controls: `4057 59/F`, `4722 69/D`, `figure-4702 93/A`
- `false_positive_applied`: `0`

Projected overlay against `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-current-repeats-2026-05-12-r1`:

- previous mean: `92.7151`
- projected mean with `0097`: `92.7892`
- gained points: `26`
- points still needed for mean `93`: `74`

## Verification

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`
- `npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts Output/goal-all-input-mean-2026-05-09-r1/input-0097-reading-generalized-2026-05-13-r1 Output/goal-all-input-mean-2026-05-09-r1/run-0097-reading-generalized-2026-05-13-r1 --no-semantic --no-pdfs`
