# All-Input Reading-Order Shell Diagnostic

## Decision

Keep this stage diagnostic-only. Do not promote the McGruff/legacy reading-order cluster yet.

The rows `0213`, `0239`, `0240`, `0241`, `0242`, `0243`, `0248`, and `0249` repeatedly show
score-moving `repair_degenerate_native_reading_order_shell` proposals rejected solely by
`pdfua.content.orphan_mcids_absent`, but the current artifacts do not prove a final PAC-clean
sequence that can be generalized safely.

## Evidence

Diagnostic artifact:
`Output/goal-all-input-mean-2026-05-09-r1/reading-order-shell-diagnostic-2026-05-10-r2`

The diagnostic found:

- `8` rows with score-moving reading-order proposals rejected solely by
  `pdfua.content.orphan_mcids_absent`.
- Each selected row improves reading order from `35` to `79` in replay evidence and preserves
  strong heading evidence.
- `0238` is useful as a route comparison row but not as PAC-clean acceptance proof: it reaches
  `97/A`, yet later accepted parent-link work can re-expose orphan MCID debt. That is why this
  stage uses final PAC-safe sequence acceptance instead of a direct orphan-MCID allow-list.

## Rejected Probe

An attempted extension of the existing degenerate-native sequence path to these row IDs was tested
locally and rejected. Targeted validations:

- `Output/goal-all-input-mean-2026-05-09-r1/run-mcgruff-reading-sequence-2026-05-10-r1`
- `Output/goal-all-input-mean-2026-05-09-r1/run-mcgruff-reading-sequence-2026-05-10-r2`

The first run recovered only a subset and the second run recovered only `0249`; `0238` also repeated
a `69/D` route. No accepted behavior was kept.

## Guardrails For Future Work

- Any future behavior should stay scoped to the diagnosed row family or a proven replay-state shape.
- The triggering tool would be `repair_degenerate_native_reading_order_shell`.
- The final sequence must reach a documented floor, preserve heading/reading gains, keep
  alt evidence high, preserve page/text/tag evidence, and have no final PAC acceptance regressions.
- No PAC scoring caps, PAC gate allow-list changes, timeout defaults, AI behavior, or new repair
  tools should change.

## Next Validation

The next useful step is a true proposal-buffer materialization probe that records why cleanup from
the rejected reading-order proposal fails, instead of relying on the current applied-stage sequence
hook.
