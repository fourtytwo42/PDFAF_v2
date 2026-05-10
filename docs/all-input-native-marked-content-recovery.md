# All-Input Native Marked-Content Text Recovery

Stage date: 2026-05-10

This stage isolated a native-untagged text ownership gap on `0283`: PAC-style content checks saw many untagged text paint operations, but the deterministic native layout tools skipped the page because unrelated marked-content blocks were already present.

Local evidence:

- Current run: `Output/goal-all-input-mean-2026-05-09-r1/run-0283-current-2026-05-10-r1`
- Direct probe: `Output/goal-all-input-mean-2026-05-09-r1/0283-allow-marked-content-synth-probe-2026-05-10-r1`
- Target validation: `Output/goal-all-input-mean-2026-05-09-r1/run-0283-native-marked-text-target-memdb-2026-05-10-r1`

Finding:

- `0283-243c7c4d24a6-03-2c974ae2-newsletter-5.pdf` has extractable native BT/ET text outside existing marked-content blocks.
- Each page also has unrelated BDC content, so `synthesize_basic_structure_from_layout` and `tag_native_text_blocks` previously returned `existing_marked_content_blocks_without_promotable_structure` / `existing_marked_content_blocks_without_promotable_bt_et`.
- The PAC-like content audit showed text/image/path outside marked content or artifact, so skipping all pages because one BDC exists was too coarse.

Behavior kept:

- `synthesize_basic_structure_from_layout` now accepts opt-in `allowExistingMarkedContentText`.
- In that mode it wraps only BT/ET groups with marked-content depth `0`, preserving existing BDC/BMC spans.
- `tag_native_text_blocks` can pass the same opt-in through to its fallback synthesis path.
- Planner passes `{ allowExistingMarkedContentText: true }` only for the proven `0283` native-untagged shape: short document, no structure tree, zero headings, substantial text, and direct content-tagging debt.

Validation:

- Target validation moved `0283` from `34/F` before remediation to `95/A`.
- `false_positive_applied = 0`.
- The accepted path used real content ownership: native structure synthesis recovered heading/reading evidence, then existing guarded cleanup reached A-grade.

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0283-native-marked-content-2026-05-10-r1`
- Mean estimate moved to `92.0484`.
- Rows below target moved to `88`.
- Points still needed for mean `93`: `334`.

Decision:

- Keep this narrow `0283` behavior.
- Do not generalize marked-content-preserving synthesis beyond rows with direct unowned text evidence and a proven target shape.
- Next target selection after this overlay selects `heading_reading_recovery_target`, led by `4139`, `4215`, and `structure-4076`.
