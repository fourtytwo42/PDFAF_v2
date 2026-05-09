# All-Input 4646 Structure/Annotation Sequence Probe

Date: 2026-05-09

## Context

The all-input heading/reading diagnostic selected `0096-27b779ba44ec-4646-youth-development-an-overview-of-related-factors-and-interventions.pdf` as the cleanest possible structure-annotation sequence candidate. Rejected heading proposals moved score and heading evidence, but PAC rejected the intermediate state for annotation structure debt.

Relevant artifacts:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-diagnostic-r1/`
- Focused validation: `Output/goal-all-input-mean-2026-05-09-r1/run-sequence-4646-target-2026-05-09-r1/`
- Tool trace: `Output/goal-all-input-mean-2026-05-09-r1/sequence-4646-one-trace-r1/`

## Result

No remediation behavior was kept.

A row-scoped sequence probe was tested locally and rejected because the existing cleanup tools did not clear the PAC annotation debt created by the heading proposal. The focused run left `4646` at `59/F`, unchanged from the current deterministic route.

The trace shows:

- `create_heading_from_candidate` can project `54 -> 79`, with `heading_structure 0 -> 95`.
- The same proposal changes visible annotation structure evidence from pass to fail: `pdfua.annotations.tagged_annotations_present` reports `63` visible annotations missing structure.
- Existing cleanup tools (`repair_native_link_structure`, `tag_unowned_annotations`, `set_link_annotation_contents`, `normalize_annotation_tab_order`) did not reduce the final annotation debt enough to satisfy the strict sequence recovery gate.
- Broader structure tools also expose ParentTree MCID debt, so accepting the intermediate state would hide real PAC-visible debt.

## Decision

`4646` is parked as `annotation_ownership_sequence_debt` until a deterministic object-level annotation ownership repair can prove final PAC-safe movement. Do not add a global annotation PAC exception, do not lower PAC gates, and do not clone the `figure-4702` sequence path for this row without a cleanup step that reduces `pdfua.annotations.tagged_annotations_present`.

The next all-input mean-recovery branch should target either:

- object-level annotation ownership repair for rows where structural proposals create unowned annotations; or
- semantic/API heading recovery after rebuilding or otherwise validating the source guard in the runtime path.
