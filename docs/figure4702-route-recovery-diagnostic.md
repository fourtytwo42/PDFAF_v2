# Figure-4702 Route Recovery Diagnostic

Generated: 2026-05-08

## Decision

No remediation behavior is accepted from this stage.

`figure-4702` is now classified as `pac_blocked_structure_recovery_candidate`, not table-batch fallout and not a simple missing-scheduler bug. The current route does schedule the score-moving structural tools, but PAC acceptance rejects them because the proposed mutation introduces `pdfua.annotations.tagged_annotations_present` and increases `pdfua.content.orphan_mcids_absent`.

## Evidence

Diagnostic artifacts:

`Output/experiment-corpus-baseline/figure4702-route-recovery-diagnostic-2026-05-08-r1`

Compared runs:

- Good historical route: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`
- Strict-grader baseline: `Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1`
- Current table-batch fixed-50: `Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1`

Findings:

- Stage 42 reached `87/B`.
- Strict/current routes remain `59/F`.
- Current PAC-blocked tools: `remap_orphan_mcids_as_artifacts`, `repair_annotation_alt_text`, `repair_structure_conformance`, and `synthesize_basic_structure_from_layout`.
- Best proposed blocked state would move score `48 -> 77` and heading structure `0 -> 94`.
- The rejected PAC rules are `pdfua.annotations.tagged_annotations_present` and `pdfua.content.orphan_mcids_absent`.
- The first Stage42/current divergence is upstream state drift at the initial document-language route, so there is no same-state route guard candidate.

## Rationale

The blocked structural route looks useful, but accepting it would require tolerating a real checker-facing annotation-structure regression before proving that later link/annotation repair can reliably clear it. That is broader than the current PAC useful-repair recovery policy, which only permits narrowly proven score-moving orphan-MCID recovery.

Do not add a global exception for `pdfua.annotations.tagged_annotations_present`, and do not weaken PAC acceptance gates from this evidence.

## Next Step

Either:

- park `figure-4702` as PAC-blocked structure/annotation sequencing debt and proceed to an acceptance-with-parked-debt checkpoint, or
- open a dedicated sequencing probe that applies the structural recovery and immediately verifies that a bounded link/annotation repair clears the annotation PAC debt without page/text/tag regressions or harmful non-annotation PAC regressions.
