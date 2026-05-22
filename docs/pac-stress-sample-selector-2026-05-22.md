# PAC Stress Sample Selector

Date: 2026-05-22

## Decision

Decision: `validation_first`.

This adds a diagnostic-only selector for the active PAC/POC alignment goal. The selector reads existing JSON reports and ranks the next PAC-stress sample options. It does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.

Local generated artifact:

- `Output/pac-stress-sample-selector-2026-05-22-r2/pac-stress-sample-selector.md`
- `Output/pac-stress-sample-selector-2026-05-22-r2/pac-stress-sample-selector.json`

Generated artifacts remain local and are not source-tracked.

## Result

Selected sample kind: `none`.

Reasoning:

- Current parity map decision is `evidence_map_only`.
- Current lane rollup is `no_safe_high_impact_lane_ready`.
- Current validation checkpoint is `validation_not_passing`, with only the all-unique scope failing.
- Original-50 now passes the current checkpoint: all-row mean `93.3000`, `false_positive_applied=0`, p95 within bound, and only the known `structure-4438` timeout.
- The Virginia outside holdout now passes at mean `95.10`, median `95.5`, `false_positive_applied=0`, and p95 within bound.
- The table/ParentTree lane has an accepted report-scale object-backed baseline, so old table stress evidence is no longer a reason to build another table sample.

No new PAC-stress sample is ready from the current evidence. The next acceptance-critical step is validation-first: a fresh all-unique run or a deliberately scoped all-unique blocker recovery, not another broad fixer.

## Candidate Summary

`object_backed_table_parenttree_targets`

- Status: `no_current_positive_evidence`
- Reason: the accepted table baseline is now `accept_report_scale_object_backed_table_proof`.
- Remaining positives/blockers such as `va-15`, `va-17`, `va-11`, `va-08`, `va-09`, and `va-10` stay useful as regression/context evidence, but they do not justify another table stress sample by themselves.

`true_rendered_contrast_controls`

- Status: `needs_better_controls`
- Reason: the current contrast sampler still flags clean/accessibility controls.
- Next useful work would require visual ground truth and stronger foreground/background sampling, not score-active promotion.

`direct_language_parts_syntax`

- Status: `already_covered_or_low_impact`
- Reason: direct document/structure `/Lang` syntax is already score-active, while heuristic language-of-parts has no safe object-context positive sample.

`font_cmap_unicode_extraction`

- Status: `no_current_positive_evidence`
- Reason: sampled CMap syntax debt had clean extracted text and zero replacement-character ratio; the accepted native text-mapping lane remains replacement-character scoring.

## Next Step

Do not reopen table behavior from old dense row-band evidence. The next work should either run a fresh all-unique validation from the current source state or explicitly target one of the current all-unique hard timeout rows with a general runtime/analyzer recovery proof.
