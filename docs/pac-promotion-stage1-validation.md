# PAC Promotion Stage 1 Validation

Generated from the local validation run on 2026-05-05.

## Artifacts

- Pre-promotion comparison run: `Output/experiment-corpus-baseline/run-stage187-full-2026-05-03-r1`
- Fresh post-promotion run: `Output/experiment-corpus-baseline/run-pac-promotion-stage1-validation-2026-05-05-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/pac-promotion-stage1-gate-2026-05-05-r1`
- PAC validation report: `Output/experiment-corpus-baseline/pac-promotion-stage1-validation-2026-05-05-r1`

Generated artifacts remain local under `Output/` and are not source-controlled.

## Decision

PAC Promotion Stage 1 should not be expanded. The validation recommends narrowing before treating this promotion as accepted.

The new behavior did preserve `false_positive_applied = 0`, but the original-50 validation failed the Stage 41 gate across score, grade, protected-regression, runtime, and attempt gates. The blast radius is larger than intended for a conservative promotion stage.

## Stage 41 Gate Result

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

## PAC Cap Findings

The validation found `73` newly observed PAC score caps versus the pre-promotion comparison run. `71` came from the Stage 1 promoted rule set.

| Rule | Category | Count |
| --- | --- | --- |
| `pdfua.font.to_unicode_cmap_valid` | `text_extractability` | 35 |
| `pdfua.font.to_unicode_cmap_present` | `text_extractability` | 30 |
| `pdfua.table.header_association_present` | `table_markup` | 6 |

The font caps are the main concern. They fired across many documents that previously scored A-grade, causing broad score drops rather than only catching rare category-pass/PAC-fail contradictions. Several drops were large enough to turn A rows into F/D rows, which is not an acceptable blast radius for this promotion.

The table-header cap fired much less often and looks closer to the intended scope, but it should still stay under validation until the font cap issue is resolved.

## PAC Gate Findings

The validation found `208` newly observed PAC gate rejection rows, but only `16` came from Stage 1 promoted gate rules:

| Rule | Count |
| --- | --- |
| `pdfua.structure.rolemap_valid` | 9 |
| `pdfua.table.header_association_present` | 7 |

No promoted `pdfua.structure.child_roles_valid` or `pdfua.parent_tree.mcid_entries_valid` gate rejections appeared in this run.

The promoted gate count is not the main blast-radius driver. The broader rejection volume is mostly from pre-existing PAC gate rules such as orphan MCID, annotation ParentTree, tagged annotation, figure alt, tab order, and table header basics. The promoted gate rules should still be rechecked after scoring caps are narrowed because scoring/path changes can alter which tools are attempted.

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

## Recommendation

The next stage should be a narrowing stage, not another promotion or new repair.

Recommended next implementation:

- Remove or narrow `pdfua.font.to_unicode_cmap_valid` and `pdfua.font.to_unicode_cmap_present` from scoring influence until the evidence can distinguish severe user-facing extraction failures from common font syntax debt.
- Keep `pdfua.table.header_association_present` under observation; it is lower-frequency and more aligned with the intended category-pass/PAC-fail contradiction model.
- Re-run the same validation after narrowing, including Stage 41 gate and the PAC validation comparator.
- Do not add more PAC scoring caps, gates, repairs, or planner routing until this stage validates cleanly.

Rendered contrast, link reachability, and AI visual-tag mismatch remain diagnostic/manual-review only and were not part of this validation stage.
