# PAC Promotion Readiness Corpus Decision

This data-only stage ran the POC/PAC strong-area evidence over the current benchmark and holdout corpora, then rolled the readiness results into a corpus-level promotion report.

Local artifacts:

- `Output/pac-promotion-readiness/experiment-corpus/`
- `Output/pac-promotion-readiness/from_sibling_pdfaf_v1_edge_mix/`
- `Output/pac-promotion-readiness/from_sibling_pdfaf_v1_edge_mix_2/`
- `Output/pac-promotion-readiness/from_sibling_pdfaf_v1_holdout_5/`
- `Output/pac-promotion-readiness/from_sibling_pdfaf_v1_hard_1/`
- `Output/pac-promotion-readiness/from_sibling_pdfaf_v1_hard_2/`
- `Output/pac-promotion-readiness/rollup/pac-promotion-readiness-rollup.md`

The rollup represented 6 readiness sources and 138 files. This stage did not change scoring, remediation gates, planner routing, mutation behavior, API responses, benchmark policy, rendered contrast, link reachability, or AI behavior.

## Safe Scoring-Cap Candidates

The corpus rollup identified three candidate rules that repeatedly produced verified category-pass/PAC-fail gaps:

| Rule | Category | Pass gaps | Corpus families | Decision |
| --- | --- | ---: | ---: | --- |
| `pdfua.font.to_unicode_cmap_valid` | `text_extractability` | 66 | 4 | Candidate for a later 89-point cap stage. |
| `pdfua.font.to_unicode_cmap_present` | `text_extractability` | 57 | 4 | Candidate for a later 89-point cap stage. |
| `pdfua.table.header_association_present` | `table_markup` | 9 | 4 | Candidate for a later 89-point cap stage. |

Recommended next scoring stage: add only these three rules to the existing conservative PAC scoring influence path, still limited to verified `fail` rows and applicable mapped categories. Keep the existing cap value of `89`; do not add direct point subtraction.

## Safe Gate Candidates

The corpus rollup identified five structural/checker-facing candidates that can regress during deterministic mutation:

| Rule | Category | Gate rows | Corpus families | Decision |
| --- | --- | ---: | ---: | --- |
| `pdfua.table.header_association_present` | `table_markup` | 20 | 4 | Candidate for regression-only acceptance gating. |
| `pdfua.structure.child_roles_valid` | `pdf_ua_compliance` | 26 | 4 | Candidate for regression-only acceptance gating. |
| `pdfua.parent_tree.mcid_entries_valid` | `pdf_ua_compliance` | 8 | 4 | Candidate for regression-only acceptance gating. |
| `pdfua.structure.rolemap_valid` | `pdf_ua_compliance` | 7 | 4 | Candidate for regression-only acceptance gating. |
| `pdfua.content.text_tagged_or_artifacted` | `reading_order` | 5 | 4 | Candidate for regression-only acceptance gating, but review noisy evidence before promotion. |

Recommended next gate stage: promote only regression prevention for these rules, using the existing Phase 4 model of rejecting non-fail-to-fail transitions or increased fail counts. Do not require remediation to fix the rule.

## Diagnostic-Only Or Blocked

These families should not be promoted yet:

- `pdfua.content.image_tagged_or_artifacted`: one gate row but many noisy/blocked rows, so evidence needs hardening before scoring or gates.
- `pdfua.table.header_cells_associated`: repeated category-pass gaps, but it is not in the selected scoring/gate rule set yet and should stay diagnostic until table-header association evidence is split more precisely.
- ParentTree annotation reference consistency and page `/StructParents` checks: useful diagnostics, but not selected for promotion in this pass.
- Language-bearing rules: broad noisy/manual-review coverage and no stable direct promotion candidate.
- TOC/Note/optional-content/file-spec rules: useful checker parity diagnostics, not safe outcome drivers yet.

Rendered contrast, link reachability, and AI visual-tag mismatch remain opt-in/manual-review because they depend on optional rendering, network behavior, or semantic inference. They are not deterministic enough for default scoring or remediation acceptance.

## Recommended Next Stage

Implement a narrow behavior-promotion stage with two independent pieces:

1. Add verified scoring caps for `pdfua.font.to_unicode_cmap_valid`, `pdfua.font.to_unicode_cmap_present`, and `pdfua.table.header_association_present`.
2. Add regression-only acceptance gates for `pdfua.table.header_association_present`, `pdfua.structure.child_roles_valid`, `pdfua.parent_tree.mcid_entries_valid`, `pdfua.structure.rolemap_valid`, and, if noisy evidence is reviewed first, `pdfua.content.text_tagged_or_artifacted`.

Keep the promotion stage conservative: no planner changes, no new repairs, no API schema changes, and no benchmark policy changes.
