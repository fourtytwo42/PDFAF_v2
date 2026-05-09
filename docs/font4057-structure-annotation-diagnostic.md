# Font-4057 Structure/Annotation Diagnostic

This diagnostic follows the current fixed-50 acceptance checkpoint and targeted blocker repeat.

Generated local artifact:

- `Output/experiment-corpus-baseline/font4057-structure-annotation-diagnostic-2026-05-09-r1`

Input run:

- `Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1`

## Result

`font-4057` repeated at `38/F`. The row has score-moving structural proposals, but every relevant proposal is rejected by `pdfua.annotations.tagged_annotations_present`.

Best rejected proposal shape:

- Score: `38 -> 61`
- Heading: `0 -> 96`
- Table: `0 -> 44`
- Reading order: `0 -> 0`
- Replay state: `0e062992948d3c7b906ceb1f`
- PAC blocker: `pdfua.annotations.tagged_annotations_present`

The diagnostic classifies the row as `mixed_table_alt_annotation_debt`, not a safe clone of the `figure-4702` structure-then-annotation sequence. The blocked structure repair moves heading evidence, but it leaves heavy table and alt debt, so accepting a row-specific sequence would need a final combined proof that annotation debt is cleared and table/alt evidence is not left below B-grade quality.

## Decision

No behavior change is accepted from this diagnostic.

Next safe work for `font-4057` is a more specific mixed table/alt/annotation design, starting from object-level table and figure evidence. Do not add a global annotation PAC exception, do not broaden `figure-4702` sequencing, and do not hide this row with checkpoint preservation.
