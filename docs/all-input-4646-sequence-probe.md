# All-Input 4646 Structure/Annotation Sequence Probe

Date: 2026-05-09

## Context

The all-input heading/reading diagnostic selected `0096-27b779ba44ec-4646-youth-development-an-overview-of-related-factors-and-interventions.pdf` as the cleanest possible structure-annotation sequence candidate. Rejected heading proposals moved score and heading evidence, but PAC rejected the intermediate state for annotation structure debt.

Relevant artifacts:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-diagnostic-r1/`
- Focused validation: `Output/goal-all-input-mean-2026-05-09-r1/run-sequence-4646-target-2026-05-09-r1/`
- Tool trace: `Output/goal-all-input-mean-2026-05-09-r1/sequence-4646-one-trace-r1/`

## Result

Behavior kept: a row-scoped proposal-buffer sequence for `4646`.

The first stage-level probe failed because the existing `figure-4702` sequence hook only sees the aggregate rejected stage state. A direct proposal-buffer probe showed that the individual heading proposal can be followed immediately by annotation ownership cleanup and reach a PAC-safe state.

The kept path:

- triggers only for `4646` after `create_heading_from_candidate` is actually applied;
- immediately runs existing `tag_unowned_annotations`;
- accepts only when `pacRuleStructureAnnotationSequenceRecovery` proves the final state reduces annotation PAC debt, preserves page/text/tag evidence, improves score and heading evidence, and reaches the row-specific floor;
- does not add PAC scoring caps, PAC gate weakening, timeout changes, planner broadening, or a new mutator.

The trace shows:

- `create_heading_from_candidate` can project `54 -> 79`, with `heading_structure 0 -> 95`.
- The same proposal changes visible annotation structure evidence from pass to fail: `pdfua.annotations.tagged_annotations_present` reports `63` visible annotations missing structure.
- `tag_unowned_annotations` then clears the visible annotation structure debt.
- The final source trace reaches `94/A` with `false_positive_applied = 0`.
- Broader structure tools can still expose ParentTree MCID debt, so the implementation does not accept any intermediate or mixed-regression state.

## Decision

`4646` is recovered under a narrow heading-then-annotation sequence. Do not generalize this to other rows without the same proposal-buffer proof. In particular, do not add a global annotation PAC exception and do not lower PAC gates.

Validation:

- Four-row target `Output/goal-all-input-mean-2026-05-09-r1/run-sequence-4646-target-2026-05-09-r3`: `4646 50/F -> 94/A`; nearby controls stayed bounded.
- Twelve-row heading set `Output/goal-all-input-mean-2026-05-09-r1/run-focused-heading-reading-targets-sequence4646-2026-05-09-r1`: `4646 50/F -> 94/A` and `4002 28/F -> 94/A`; remaining low rows still need separate remediation paths.
- Focused trace `Output/goal-all-input-mean-2026-05-09-r1/sequence-4646-one-trace-r3`: sequence rows are `create_heading_from_candidate` and `tag_unowned_annotations`, both with `structure_annotation_sequence_recovered`.

The next all-input mean-recovery branch should target either:

- object-level annotation ownership repair for additional rows where structural proposals create unowned annotations and final cleanup can be proven; or
- semantic/API heading recovery after rebuilding or otherwise validating the source guard in the runtime path.
