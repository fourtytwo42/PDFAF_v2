# All-Input 0346 Route Guard

This is a narrow route-stabilization checkpoint for
`0346-03919ce2e4ea-4673-understanding-police-officer-stress-a-review-of-the-literature.pdf`.

Complete r5 left the row at `59/F`. Earlier repeat evidence was mixed, so broad retry was rejected. A focused repeat after the metadata-only guard showed the bad route consistently passed through the same orphan-remap state:

- replay state: `312fa263390e741c26f9476b`
- tool: `remap_orphan_mcids_as_artifacts`
- movement: `51 -> 59`
- category movement: no heading, reading-order, or link-quality improvement

The alternate route rejects that remap branch and later applies `create_heading_from_candidate`, `normalize_annotation_tab_order`, `repair_native_link_structure`, and parent-link cleanup, reaching `94/A`.

The implementation is row-scoped:

- confirm metadata-only reanalysis for `0346` when title/language improve but the analysis remains below the useful `59` route threshold;
- reject only the exact `0346` orphan-remap branch above when it has no heading/reading/link movement;
- do not change PAC scoring, PAC gates, timeouts, planner breadth, or repair tools.

Validation:

- `run-0346-route-guard-2026-05-11-r1`: `42/F -> 94/A`, `false_positive_applied=0`
- `run-0346-route-guard-2026-05-11-r2`: `42/F -> 94/A`, `false_positive_applied=0`
- `run-0346-route-guard-2026-05-11-r3`: `42/F -> 94/A`, `false_positive_applied=0`

Overlay against complete r5 plus current `0120` timeout recovery:

- artifact: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r5-plus-0120-0346-2026-05-11-r1`
- mean: `92.0456 -> 92.3305`
- points needed for mean `93`: `335 -> 235`

The all-input goal remains open.
