# All-Input Visible Title Anchor Gap

Stage date: 2026-05-10

This stage isolated a native-untagged heading gap that PAC-style review can see from the document outline and extracted visible text, but the internal visible-heading selector could not use because there was no MCID-backed anchor.

Local diagnostic:

- `Output/goal-all-input-mean-2026-05-09-r1/visible-title-anchor-gap-2026-05-10-r3`

Result:

- `0034-0fca5a3c849e-v1-4716.pdf` is a `bookmark_visible_text_anchor_gap`.
- The external text layer contains `2022 Victim Service Planning Research Report` on page 1, matching real outline titles.
- Internal analysis classifies it as `native_untagged`, zero headings, missing structure tree, no MCID spans, and no paragraph struct elements, so the existing visible-heading anchor path does not schedule.
- `0283` and `3924` do not have enough visible title evidence for this path.
- `0086` and `0181` are tagged/owned shapes and need different route diagnostics.

Behavior kept:

- `synthesize_basic_structure_from_layout` now accepts optional `maxPages`.
- Planner passes `{ maxPages: 12 }` only for the proven `0034` / `v1-4716` long native-untagged shape.
- This keeps the repair honest: it tags real BT/ET content on a bounded prefix instead of creating an unowned/fake heading, then existing annotation/link/PDF-UA cleanup finishes the state.

Validation:

- Target run: `Output/goal-all-input-mean-2026-05-09-r1/run-0034-bounded-layout-target-2026-05-10-r1`
- `0034` moved `35/F -> 93/A`.
- Runtime dropped from the prior current run’s `285364ms` to `26783ms`.
- `false_positive_applied = 0`.
- Final categories: heading `94`, reading order `79`, link quality `100`, PDF/UA `100`, title/language `100`, text extractability `96`.

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0034-bounded-layout-2026-05-10-r1`
- Mean estimate moved to `91.9259`.
- Rows below target moved to `89`.
- Points still needed for mean `93`: `377`.

Decision:

- Keep this narrow `0034` behavior.
- Do not generalize visible-title synthesis to rows without verified outline/text evidence.
- Next target selection should focus on remaining high-deficit rows after the `91.9259` overlay, not on broad table/header or font/CMap changes.
