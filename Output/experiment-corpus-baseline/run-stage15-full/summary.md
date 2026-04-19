# Experiment corpus benchmark summary

- **Run ID:** `run-2026-04-19T05-30-39-879Z`
- **Generated:** 2026-04-19T05:30:39.879Z
- **Mode:** `full`
- **Semantic enabled:** yes
- **Write PDFs:** no
- **Selected files:** 50 / 50

## Overall

- **Analyze success/errors:** 50 / 0
- **Remediate success/errors:** 50 / 0
- **Analyze scores:** mean 55.9 · median 54.0 · p95 90.0
- **Analyze runtime (`analysisDurationMs`):** mean 821.2 · median 686.0 · p95 1367.0
- **Analyze runtime (wall):** mean 822.6 · median 686.8 · p95 1367.8
- **Analyze grades:** A:3, B:3, C:7, D:9, F:28
- **Analyze pdfClass:** native_tagged:33, native_untagged:17
- **Analyze structure class:** partially_tagged:33, untagged_digital:17
- **Analyze primary failure family:** figure_alt_ownership_heavy:1, font_extractability_heavy:1, mixed_structural:15, structure_reading_order_heavy:33
- **Weakest categories:** alt_text (23); title_language (20); pdf_ua_compliance (18); heading_structure (17); reading_order (14); table_markup (2)
- **Top findings:** Color contrast was not evaluated (no pixel sampling in this build). (50); XMP metadata does not declare PDF/UA conformance (pdfuaid:part missing). (47); Document language (/Lang) is not specified. (36); 64 marked-content MCID(s) appear outside the structure tree (Acrobat "Tagged content" / orphan MCIDs). (21); Document is missing both /Title and /Lang. Essential metadata for screen reader users is absent. (20); /MarkInfo dictionary is missing or /Marked is not true. (19); Document is not tagged (no structure tree or /MarkInfo/Marked). (17); Reading order cannot be verified without a document structure tree. (17); Structure tree (/StructTreeRoot) is absent. (17); Document language is not set (/Lang missing). Screen readers cannot select the correct voice/language. (16)
- **Analyze manual-review count:** 45
- **Analyze manual-review reasons:** Color contrast was not machine-verified because this build does not perform rendered pixel contrast analysis. (50); Annotation tab order or /StructParent issues mean reading order should be checked manually with assistive technology. (30); Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification. (20); Reading order fell back to heading/paragraph heuristics because no structure tree was available. (17)
- **Analyze category manual review:** color_contrast (50); reading_order (42); alt_text (20)
- **Analyze category verification:** alt_text: manual_review_required=20, verified=30; bookmarks: verified=50; color_contrast: manual_review_required=50; form_accessibility: verified=50; heading_structure: verified=50; link_quality: verified=50; pdf_ua_compliance: heuristic=42, verified=8; reading_order: manual_review_required=42, verified=8; table_markup: verified=50; text_extractability: verified=50; title_language: verified=50
- **Analyze deterministic issues:** pdf_ua_compliance (50); reading_order (43); tagged_content_paint (42); title_language (41); tagged_content_orphans (34); annotation_tabs (28); heading_structure (24); text_extractability (18); bookmarks (15); annotation_struct_parent (7)
- **Analyze semantic issues:** alt_text (29); figure_meaning (26)
- **Analyze manual-only issues:** reading_order (42); alt_text (20)
- **Reading-order signals:** missing_structure_tree (17); annotation_struct_parent_risk (8); annotation_order_risk (5); sampled_structure_page_order_drift (2); header_footer_pollution_risk (1)
- **Annotation signals:** pages_missing_tabs_s (28); link_annotations_missing_struct_parent (7); pages_annotation_order_differs (5); link_annotations_missing_structure (1); nonlink_annotations_missing_struct_parent (1); nonlink_annotations_missing_structure (1)
- **Tagged-content signals:** path_paint_outside_mc (42); orphan_mcids (34); tagged_annotation_risk (2)
- **List/table legality signals:** lists_without_items (3); irregular_tables (2); strongly_irregular_tables (2); lbl_body_misplaced (1); list_item_misplaced (1)
- **Analyze score caps:** alt_text (1)
- **Remediation before scores:** mean 55.9 · median 54.0 · p95 90.0
- **Remediation after scores:** mean 97.0 · median 98.0 · p95 100.0
- **Reanalyzed scores:** mean 97.0 · median 98.0 · p95 100.0
- **Score delta:** mean 41.1 · median 40.0 · p95 80.0
- **Remediation runtime (`remediationDurationMs`):** mean 16669.1 · median 5898.0 · p95 86276.0
- **Remediation runtime (wall):** mean 17620.0 · median 6993.6 · p95 88159.3
- **Post-write analyze runtime:** mean 821.3 · median 692.0 · p95 1760.0
- **Total pipeline runtime:** mean 17620.0 · median 6993.6 · p95 88159.3
- **Remediation manual review (before/after/reanalyzed):** 45 / 9 / 9
- **Remediation manual-review reasons:** Color contrast was not machine-verified because this build does not perform rendered pixel contrast analysis. (50); PDF/UA compliance includes heuristic proxy signals and should be confirmed with external/manual review before treating as a high-confidence pass. (4); OCR metadata indicates a machine-generated text layer that was not verified for recognition accuracy, logical order, or assistive-technology usability. (3); Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification. (1); Annotation tab order or /StructParent issues mean reading order should be checked manually with assistive technology. (1)
- **Remediation category manual review:** color_contrast (50); pdf_ua_compliance (4); text_extractability (3); alt_text (1); reading_order (1)
- **Remediation category verification:** alt_text: manual_review_required=1, verified=49; bookmarks: verified=50; color_contrast: manual_review_required=50; form_accessibility: verified=50; heading_structure: verified=50; link_quality: verified=50; pdf_ua_compliance: heuristic=3, manual_review_required=4, verified=43; reading_order: manual_review_required=1, verified=49; table_markup: verified=50; text_extractability: manual_review_required=3, verified=47; title_language: verified=50
- **Remediation score caps:** text_extractability (3)
- **Remediation primary routes:** font_ocr_repair:1, font_unicode_tail_recovery:4, post_bootstrap_heading_convergence:28, structure_bootstrap:6, structure_bootstrap_and_conformance:10
- **Remediation skipped-tool reasons:** missing_precondition (280); not_applicable (253); semantic_deferred (219); already_succeeded (50); category_not_failing (33)
- **Remediation scheduled tools:** mark_untagged_content_as_artifact (49); repair_structure_conformance (49); set_document_language (46); set_document_title (46); set_pdfua_identification (46); artifact_repeating_page_furniture (45); repair_native_reading_order (42); normalize_annotation_tab_order (40); set_link_annotation_contents (40); repair_native_link_structure (36)
- **Remediation outcome status:** fixed:36, needs_manual_review:11, partially_fixed:3
- **Remediation outcome families:** headings:fixed (46); tables:fixed (46); lists:fixed (45); annotations:fixed (43); tagged_content:fixed (40); tagged_content:partially_fixed (9); lists:needs_manual_review (5); headings:needs_manual_review (3); tables:needs_manual_review (2); annotations:needs_manual_review (1)
- **Semantic lanes used:** figures (50); headings (50); promote_headings (50); untagged_headings (50)
- **Semantic lane skip reasons:** untagged_headings:unsupported_pdf (50); figures:alt_text_sufficient (48); headings:heading_structure_sufficient (47); promote_headings:heading_structure_sufficient (47); headings:no_candidates (3); promote_headings:no_candidates (3); figures:no_candidates (2)
- **Semantic lane change status:** figures:skipped (50); headings:skipped (50); promote_headings:skipped (50); untagged_headings:skipped (50)
- **Stage runtime hotspots:** planner:stage2 (192006 ms); planner:stage3 (156865 ms); planner:stage7 (151314 ms); planner:stage1 (61683 ms); planner:stage9 (47046 ms); planner:stage4 (45176 ms); planner:stage5 (13850 ms); planner:stage8 (9720 ms); post_pass:stage11 (8814 ms); planner:stage6 (1162 ms); post_pass:stage12 (820 ms)
- **Tool runtime hotspots:** ocr_scanned_pdf (146667 ms); repair_structure_conformance (132218 ms); remap_orphan_mcids_as_artifacts (66306 ms); tag_unowned_annotations (64958 ms); repair_native_link_structure (64194 ms); mark_untagged_content_as_artifact (15243 ms); set_pdfua_identification (13727 ms); artifact_repeating_page_furniture (9649 ms); set_document_language (8118 ms); set_document_title (7946 ms); normalize_annotation_tab_order (7607 ms); set_link_annotation_contents (7461 ms); tag_ocr_text_blocks (2764 ms); tag_native_text_blocks (1998 ms); synthesize_basic_structure_from_layout (1946 ms); bootstrap_struct_tree (1911 ms); add_page_outline_bookmarks (1764 ms); create_heading_from_candidate (910 ms); replace_bookmarks_from_headings (716 ms); normalize_heading_hierarchy (599 ms)
- **Semantic runtime hotspots:** n/a
- **Bounded-work signals:** semantic_skip:untagged_headings:unsupported_pdf (50); semantic_skip:figures:alt_text_sufficient (48); semantic_skip:headings:heading_structure_sufficient (47); semantic_skip:promote_headings:heading_structure_sufficient (47); deterministic_early_exit:round_no_improvement (8); deterministic_early_exit:no_planned_stages (5); semantic_skip:headings:no_candidates (3); semantic_skip:promote_headings:no_candidates (3); semantic_skip:figures:no_candidates (2); deterministic_early_exit:target_score_reached (1)
- **Score per second:** 2.335
- **Confidence per second:** 0.025

## Per Cohort

| Cohort | Files | Analyze score | Analyze p95 wall ms | Primary families | Remediate delta | Remediate p95 total ms |
| --- | ---: | --- | ---: | --- | --- | ---: |
| 00-fixtures | 6 | 69.0 | 1212 | figure_alt_ownership_heavy:1, font_extractability_heavy:1, mixed_structural:3, structure_reading_order_heavy:1 | 28.5 | 9818 |
| 10-short-near-pass | 8 | 49.0 | 649 | mixed_structural:2, structure_reading_order_heavy:6 | 45.1 | 7388 |
| 20-figure-ownership | 10 | 62.0 | 1218 | mixed_structural:2, structure_reading_order_heavy:8 | 36.1 | 15983 |
| 30-structure-reading-order | 10 | 52.2 | 3528 | mixed_structural:3, structure_reading_order_heavy:7 | 45.6 | 204744 |
| 40-font-extractability | 8 | 37.6 | 1798 | mixed_structural:2, structure_reading_order_heavy:6 | 58.9 | 88159 |
| 50-long-report-mixed | 8 | 68.0 | 1040 | mixed_structural:3, structure_reading_order_heavy:5 | 29.6 | 56582 |

## Failure Family Stability

- **00-fixtures:** figure_alt_ownership_heavy:1, font_extractability_heavy:1, mixed_structural:3, structure_reading_order_heavy:1
- **10-short-near-pass:** mixed_structural:2, structure_reading_order_heavy:6
- **20-figure-ownership:** mixed_structural:2, structure_reading_order_heavy:8
- **30-structure-reading-order:** mixed_structural:3, structure_reading_order_heavy:7
- **40-font-extractability:** mixed_structural:2, structure_reading_order_heavy:6
- **50-long-report-mixed:** mixed_structural:3, structure_reading_order_heavy:5

## False-Clean Pressure

- Files with strong structural signals but unexpectedly high category scores should be reviewed in the JSON artifacts using `detectionProfile` alongside category outputs.
- Reading-order signal frequency: missing_structure_tree (17); annotation_struct_parent_risk (8); annotation_order_risk (5); sampled_structure_page_order_drift (2); header_footer_pollution_risk (1)
- Annotation signal frequency: pages_missing_tabs_s (28); link_annotations_missing_struct_parent (7); pages_annotation_order_differs (5); link_annotations_missing_structure (1); nonlink_annotations_missing_struct_parent (1); nonlink_annotations_missing_structure (1)
- Tagged-content signal frequency: path_paint_outside_mc (42); orphan_mcids (34); tagged_annotation_risk (2)
- List/table signal frequency: lists_without_items (3); irregular_tables (2); strongly_irregular_tables (2); lbl_body_misplaced (1); list_item_misplaced (1)

## Slowest Analyze Files

- `30-structure-reading-order/4076-Juvenile Justice Data 2004 Annual Report APPENDIX H Data Tables.pdf` (30-structure-reading-order) — 3528 ms
- `40-font-extractability/3529-Information Technology for Criminal Justice.pdf` (40-font-extractability) — 1798 ms
- `40-font-extractability/3448-Flow of Funds in Illinois Criminal Justice System.pdf` (40-font-extractability) — 1368 ms
- `20-figure-ownership/4466-Victim Need Report_ Service Providers_ Perspectives on the Needs of Crime Victims and Service Gaps.pdf` (20-figure-ownership) — 1218 ms
- `00-fixtures/pdfaf_fixture_inaccessible.pdf` (00-fixtures) — 1212 ms
- `30-structure-reading-order/4438-Inventorying Employment Restrictions Task Force Final Report.pdf` (30-structure-reading-order) — 1141 ms
- `20-figure-ownership/4754-2023 Domestic Violence Fatality Review Committee Annual Report.pdf` (20-figure-ownership) — 1050 ms
- `50-long-report-mixed/4516-An Exploratory Study of the Discretionary Use of Electronic Monitoring for Individuals Upon Release to Mandatory Supervised Release _MSR_ in Illinois.pdf` (50-long-report-mixed) — 1040 ms
- `50-long-report-mixed/4606-Illinois Criminal Justice Information Authority 2018 Annual Report.pdf` (50-long-report-mixed) — 1033 ms
- `20-figure-ownership/4753-2022 Domestic Violence Fatality Review Committee Annual Report.pdf` (20-figure-ownership) — 998 ms

## Slowest Remediate Files

- `30-structure-reading-order/4438-Inventorying Employment Restrictions Task Force Final Report.pdf` (30-structure-reading-order) — 204744 ms
- `30-structure-reading-order/4076-Juvenile Justice Data 2004 Annual Report APPENDIX H Data Tables.pdf` (30-structure-reading-order) — 89712 ms
- `40-font-extractability/3529-Information Technology for Criminal Justice.pdf` (40-font-extractability) — 88159 ms
- `40-font-extractability/3448-Flow of Funds in Illinois Criminal Justice System.pdf` (40-font-extractability) — 67789 ms
- `50-long-report-mixed/4516-An Exploratory Study of the Discretionary Use of Electronic Monitoring for Individuals Upon Release to Mandatory Supervised Release _MSR_ in Illinois.pdf` (50-long-report-mixed) — 56582 ms
- `40-font-extractability/3437-Information Networks Expanding.pdf` (40-font-extractability) — 45492 ms
- `50-long-report-mixed/4606-Illinois Criminal Justice Information Authority 2018 Annual Report.pdf` (50-long-report-mixed) — 16926 ms
- `20-figure-ownership/4466-Victim Need Report_ Service Providers_ Perspectives on the Needs of Crime Victims and Service Gaps.pdf` (20-figure-ownership) — 15983 ms
- `50-long-report-mixed/4146-ICJIA 2008 Annual Report.pdf` (50-long-report-mixed) — 14451 ms
- `20-figure-ownership/4754-2023 Domestic Violence Fatality Review Committee Annual Report.pdf` (20-figure-ownership) — 12781 ms

## Highest Delta Files

- `40-font-extractability/3437-Information Networks Expanding.pdf` (40-font-extractability) — Δ +80
- `40-font-extractability/3448-Flow of Funds in Illinois Criminal Justice System.pdf` (40-font-extractability) — Δ +80
- `40-font-extractability/3529-Information Technology for Criminal Justice.pdf` (40-font-extractability) — Δ +80
- `20-figure-ownership/4194-Childrens risk of homicide Victimization from birth to age 14 1965 to 1995.pdf` (20-figure-ownership) — Δ +67
- `00-fixtures/ADAM2.pdf` (00-fixtures) — Δ +66
- `10-short-near-pass/3981-Illinois Bill of Rights for Victims and Witnesses of Violent Crime _Polish_.pdf` (10-short-near-pass) — Δ +66
- `40-font-extractability/4035-Comparison of official and unofficial sources of criminal history record information.pdf` (40-font-extractability) — Δ +66
- `10-short-near-pass/4101-Implementing restorative justice A guide for schools.pdf` (10-short-near-pass) — Δ +57
- `30-structure-reading-order/3661-A Generation of Change 30 Years of Criminal Justice in Illinois.pdf` (30-structure-reading-order) — Δ +57
- `30-structure-reading-order/3994-Community Policing in Chicago The Chicago Alternative Policing Strategy _CAPS_ Year Ten.pdf` (30-structure-reading-order) — Δ +57

## Lowest Delta Files

- `00-fixtures/pdfaf_fixture_accessible.pdf` (00-fixtures) — Δ +1
- `20-figure-ownership/4753-2022 Domestic Violence Fatality Review Committee Annual Report.pdf` (20-figure-ownership) — Δ +2
- `20-figure-ownership/4466-Victim Need Report_ Service Providers_ Perspectives on the Needs of Crime Victims and Service Gaps.pdf` (20-figure-ownership) — Δ +6
- `00-fixtures/Microsoft_Teams_Quickstart (1).pdf` (00-fixtures) — Δ +14
- `50-long-report-mixed/4608-Law Enforcement Response to Mental Health Crisis Incidents_ A Survey of Illinois Police and Sheriff_s Departments.pdf` (50-long-report-mixed) — Δ +17
- `50-long-report-mixed/4700-R3 2022 Annual Report.pdf` (50-long-report-mixed) — Δ +18
- `00-fixtures/Microsoft_Teams_Quickstart (1)-targeted-figures-wave1-b2.pdf` (00-fixtures) — Δ +19
- `00-fixtures/Microsoft_Teams_Quickstart (1)-remediated.pdf` (00-fixtures) — Δ +20
- `30-structure-reading-order/4076-Juvenile Justice Data 2004 Annual Report APPENDIX H Data Tables.pdf` (30-structure-reading-order) — Δ +22
- `20-figure-ownership/4754-2023 Domestic Violence Fatality Review Committee Annual Report.pdf` (20-figure-ownership) — Δ +23
