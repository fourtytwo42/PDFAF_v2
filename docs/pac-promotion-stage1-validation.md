# PAC Promotion Stage 1 Validation

Generated from local validation runs on 2026-05-05 and 2026-05-06.

## Artifacts

- Pre-promotion comparison run: `Output/experiment-corpus-baseline/run-stage187-full-2026-05-03-r1`
- Fresh post-promotion run: `Output/experiment-corpus-baseline/run-pac-promotion-stage1-validation-2026-05-05-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/pac-promotion-stage1-gate-2026-05-05-r1`
- PAC validation report: `Output/experiment-corpus-baseline/pac-promotion-stage1-validation-2026-05-05-r1`
- Narrowed scoring run: `Output/experiment-corpus-baseline/run-pac-promotion-stage1-narrowed-2026-05-06-r1`
- Narrowed scoring gate/report: `Output/experiment-corpus-baseline/pac-promotion-stage1-narrowed-gate-2026-05-06-r1`, `Output/experiment-corpus-baseline/pac-promotion-stage1-narrowed-validation-2026-05-06-r1`
- Scoring-reverted run: `Output/experiment-corpus-baseline/run-pac-promotion-stage1-scoring-reverted-2026-05-06-r1`
- Scoring-reverted gate/report: `Output/experiment-corpus-baseline/pac-promotion-stage1-scoring-reverted-gate-2026-05-06-r1`, `Output/experiment-corpus-baseline/pac-promotion-stage1-scoring-reverted-validation-2026-05-06-r1`

Generated artifacts remain local under `Output/` and are not source-controlled.

## Decision

PAC Promotion Stage 1 scoring influence should be reverted completely. PAC evidence and regression-only gates can remain, but no Stage 1 promoted PAC rules should apply numeric score caps yet.

The original promotion and the narrowed scoring rerun both failed the Stage 41 gate across score, grade, protected-regression, runtime, and attempt gates. Fully removing Stage 1 scoring influence reduced promoted PAC score caps to `0`, but the run still failed because of PAC gate/path/runtime debt. That means the immediate scoring-cap blast radius is fixed, while acceptance-gate breadth and runtime remain separate follow-up work.

## Stage 41 Gate Result

Initial promoted scoring run:

- Gate: fail
- Mean: `86.9 -> 73.12`
- Median: `92 -> 77`
- F count: `6 -> 16`
- Protected file regressions: `0 -> 10`
- p95 wall runtime: `84056.89ms -> 247254.39ms`
- Median wall runtime: `10594.99ms -> 17925.27ms`
- Attempts: `843 -> 1023`
- False-positive applied: `0`

Failed hard gates were `score_mean_floor`, `score_median_floor`, `f_grade_count`, `protected_file_regressions`, `runtime_p95_wall`, `runtime_median_wall`, and `total_tool_attempts`.

Scoring-reverted final run:

- Gate: fail
- Mean: `86.9 -> 77.04`
- Median: `92 -> 90`
- F count: `6 -> 14`
- Protected file regressions: `0 -> 22`
- p95 wall runtime: `84056.89ms -> 237568.24ms`
- Median wall runtime: `10594.99ms -> 16375.89ms`
- Attempts: `843 -> 1019`
- False-positive applied: `0`

The final run still failed the same hard gates, but the comparator attributed no drops to Stage 1 promoted scoring caps.

## PAC Cap Findings

The validation found `73` newly observed PAC score caps versus the pre-promotion comparison run. `71` came from the Stage 1 promoted rule set.

| Rule | Category | Count |
| --- | --- | --- |
| `pdfua.font.to_unicode_cmap_valid` | `text_extractability` | 35 |
| `pdfua.font.to_unicode_cmap_present` | `text_extractability` | 30 |
| `pdfua.table.header_association_present` | `table_markup` | 6 |

The font caps are the main concern. They fired across many documents that previously scored A-grade, causing broad score drops rather than only catching rare category-pass/PAC-fail contradictions. Several drops were large enough to turn A rows into F/D rows, which is not an acceptable blast radius for this promotion.

The table-header cap fired much less often and looks closer to the intended scope, but it should still stay under validation until the font cap issue is resolved.

After the narrowed rerun, table-header scoring still produced `6` promoted score caps and the Stage 41 gate still failed. The final implementation therefore removed table-header scoring influence too. In the scoring-reverted final run, `promotedPacScoreCapCount = 0`; the only remaining new PAC cap was an older Phase 3 form `/TU` cap on `short-4660`, not a Stage 1 promoted rule.

## PAC Gate Findings

The validation found `208` newly observed PAC gate rejection rows, but only `16` came from Stage 1 promoted gate rules:

| Rule | Count |
| --- | --- |
| `pdfua.structure.rolemap_valid` | 9 |
| `pdfua.table.header_association_present` | 7 |

No promoted `pdfua.structure.child_roles_valid` or `pdfua.parent_tree.mcid_entries_valid` gate rejections appeared in this run.

The promoted gate count is not the scoring-cap blast-radius driver, but it is now the main remaining PAC-promotion risk. In the scoring-reverted final run, `promotedPacGateRejectionCount = 14`, all from `pdfua.structure.rolemap_valid` and `pdfua.structure.child_roles_valid`. The broader rejection volume is mostly from pre-existing PAC gate rules such as orphan MCID, annotation ParentTree, tagged annotation, figure alt, tab order, and table header basics.

## Score Movement

The comparator found `42` post-promotion score drops versus `run-stage187-full-2026-05-03-r1`.

- `32` were classified as cap-attributable.
- `6` rows had PAC gates block a mutation while the final score stayed stable or improved.
- The largest drops were dominated by newly promoted font caps or by remediation/analyzer path movement that appeared once the run diverged.

Representative cap-attributable drops:

| File | Before | After | Classification | New PAC Rules |
| --- | --- | --- | --- | --- |
| `structure-4122` | `99/A` | `32/F` | cap-attributable | `pdfua.font.to_unicode_cmap_valid` |
| `figure-4188` | `98/A` | `32/F` | cap-attributable | `pdfua.font.to_unicode_cmap_present`, `pdfua.font.to_unicode_cmap_valid` |
| `structure-4078` | `98/A` | `32/F` | cap-attributable | `pdfua.font.to_unicode_cmap_present`, `pdfua.font.to_unicode_cmap_valid` |
| `font-4057` | `98/A` | `36/F` | cap-attributable | `pdfua.font.to_unicode_cmap_present`, `pdfua.font.to_unicode_cmap_valid` |
| `short-4074` | `99/A` | `44/F` | cap-attributable | `pdfua.font.to_unicode_cmap_present` |

## Final Recommendation

The next stage should be PAC gate/runtime narrowing, not another scoring promotion or new repair.

Completed in this stage:

- Removed `pdfua.font.to_unicode_cmap_valid`, `pdfua.font.to_unicode_cmap_present`, and `pdfua.table.header_association_present` from Stage 1 scoring influence.
- Kept font/CMap and table-header PAC evidence diagnostic-only.
- Kept Stage 1 regression-only gates active for now.

Recommended next implementation:

- Investigate whether `pdfua.structure.rolemap_valid` and `pdfua.structure.child_roles_valid` gates are too broad for deterministic acceptance, because they are the only promoted gate rules that fired in the final scoring-reverted run.
- Reduce PAC gate rejection attempt churn before any further benchmark acceptance claim.
- Keep all Stage 1 scoring caps out until a new corpus run shows a narrow candidate with no score, protected, runtime, or attempt regression.
- Do not add more PAC scoring caps, gates, repairs, or planner routing until this stage validates cleanly.

Rendered contrast, link reachability, and AI visual-tag mismatch remain diagnostic/manual-review only and were not part of this validation stage.
