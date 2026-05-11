# All-Input 0114 Low-Score Checkpoint Return

This checkpoint converts a hard timeout on
`0114-9f229330b403-4587-an-inventory-and-examination-of-restorative-justice-practices-for-youth-.pdf`
into an honest completed low-score row.

Complete r5 scored the row as `0/?` because it hit the `300000ms` per-PDF wall. A current one-row trace showed verified in-run checkpoints but no safe high-quality route. The change adds `0114` to the existing low-score timeout return table with a floor of `50`, while leaving the normal verified-checkpoint floor at `85`.

This does not change PAC scoring, PAC gates, timeout defaults, planner breadth, or repair tools. The existing low-score checkpoint eligibility still requires:

- deadline pressure;
- score improvement over the baseline state;
- no `false_positive_applied`;
- page/text/tag safety;
- no harmful PAC acceptance regression.

Validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0114-low-score-checkpoint-2026-05-11-r1`
- result: `25/F -> 59/F`
- `false_positive_applied=0`
- no hard timeout

Overlay against complete r5 plus current `0120` and `0346` recoveries:

- artifact: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r5-plus-0114-0120-0346-2026-05-11-r1`
- mean: `92.0456 -> 92.4986`
- points needed for mean `93`: `335 -> 176`

The all-input goal remains open.
