# All-Input Degenerate Native Sequence

## Decision

Promote a narrow evidence-based recovery for degenerate native structure
bootstrap states.

The original proof row was `0275-...-4002-driving-under-the-influence...pdf`.
It exposes a degenerate native structure path where
`create_structure_from_degenerate_native_anchor` is score-moving but can trip
`pdfua.content.orphan_mcids_absent` as an intermediate PAC regression. Direct
and production-route probes showed that existing guarded cleanup can recover
the final state without adding a new mutator.

## Evidence

- Direct sequence probe: `Output/goal-all-input-mean-2026-05-09-r1/0275-degenerate-native-sequence-probe-r1`
- Production-route probe: `Output/goal-all-input-mean-2026-05-09-r1/0275-production-route-sequence-probe-r1`
- Targeted validation: `Output/goal-all-input-mean-2026-05-09-r1/run-0275-degenerate-native-sequence-target-2026-05-09-r3`
- Generalized validation: `Output/goal-all-input-mean-2026-05-09-r1/run-degenerate-native-generalized-2026-05-13-r1`

Targeted validation results:

| File | Before | After | False positives |
| --- | ---: | ---: | ---: |
| `0275-...-4002-driving-under-the-influence...pdf` | `28/F` | `94/A` | `0` |
| `0033-...-v1-4655.pdf` | `46/F` | `94/A` | `0` |
| `0096-...-4646-youth-development...pdf` | `50/F` | `97/A` | `0` |
| `0183-...-4593-focused-deterrence...pdf` | `42/F` | `94/A` | `0` |

## Guardrails

- The seed stage must include `create_structure_from_degenerate_native_anchor`.
- The only allowed seed-stage PAC regression is `pdfua.content.orphan_mcids_absent`.
- The seed must improve total score, heading structure, and reading order.
- Page count, text count, and tagged state must be preserved.
- The explicit sequence attempt is admitted only after an applied degenerate
  native structure bootstrap.
- Sequence acceptance, when needed, requires final score `>=93`, preserved or
  improved heading and reading scores, alt score `>=90`, page/text/tag
  preservation, and no final PAC regressions.
- Later cleanup still runs through existing guarded post-pass acceptance; no
  PAC scoring caps or PAC gate allow-list changes were added.

## All-Input Impact Estimate

Progress overlay:
`Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0275-sequence-2026-05-09-r1`

Estimated 351-PDF movement after overlaying current proven target runs:

- Mean: `88.5214 -> 89.0598`
- Rows below target: `136 -> 131`
- Points still needed for mean `93`: `1383`
- Runtime p95 unchanged in the overlay: `351416ms`

## Next Direction

Continue with diagnostic-first target selection. The overlay still ranks
heading/reading rows as the largest deficit family, followed by table debt and
alt debt. This generalized predicate removes the row gate but does not close
the fresh all-unique-PDF mean goal.
