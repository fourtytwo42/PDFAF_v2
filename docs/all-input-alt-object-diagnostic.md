# All-Input Alt Object Diagnostic

This diagnostic targets the fresh r4 `alt_recovery_target` rows before adding any
new alt remediation behavior.

Local artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/alt-object-diagnostic-2026-05-11-r2/all-input-alt-object-diagnostic.md`

Focused run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-alt-object-targets-2026-05-11-r1`

Result:

- `0325-...4693...pdf` repeated as a current-code recovery: `59/F -> 98/A`.
- `0296-...redeploy...pdf` repeated as a partial current-code recovery: `59/F -> 88/B`, with protected reanalysis at `90`.
- `0136-...methamphetamine-study.pdf` is the only direct checker-visible missing-alt candidate: `102/102` checker-visible figures lack alt.
- `0200` and `0236` are not alt-first rows after reanalysis; their checker-visible figures no longer have missing alt.

The `0136` second-pass probe proves that existing `set_figure_alt_text` can move the row, but only to `80/B`:

- Probe artifact: `Output/goal-all-input-mean-2026-05-09-r1/run-alt-0136-secondpass-probe-2026-05-11-r1`
- The probe applies bounded `set_figure_alt_text` targets and improves alt from `0` to `20`.
- It still leaves too much direct missing-alt debt to drive the all-input mean goal by itself.

Overlay against fresh r4:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-fresh-r4-plus-alt-object-2026-05-11-r2`
- Mean moves only `91.359 -> 91.5527`.
- Points still needed for mean `93`: `508`.

Decision:

- Do not add a broad alt-route or second-pass ordering change from this evidence.
- Keep `0136` as a direct object-level alt candidate, but it needs either a safe many-target alt strategy or semantic/visual alt support before promotion.
- Treat `0200` and `0236` as heading/table/PDF-UA rows, not alt rows.

## Fresh r5 Complete Follow-Up

After all eight r5 shards completed, the focused alt set was rerun:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-alt-r5-complete-2026-05-11-r1`
- Object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/alt-object-diagnostic-r5-complete-2026-05-11-r1/all-input-alt-object-diagnostic.md`
- Second-pass `0136` probe: `Output/goal-all-input-mean-2026-05-09-r1/run-alt-0136-secondpass-r5-complete-2026-05-11-r1`

Findings:

- `0149-...field-observations.pdf` is a current-code recovery/control: `54/F -> 94/A`, reanalysis stays `94/A`.
- `long-4683` reaches run score `92/A`, but direct reanalysis of the remediated PDF drops to `59/F`; treat this as protected/analyzer drift, not an accepted recovery.
- `0136-...methamphetamine-study.pdf` remains the cleanest direct alt candidate: the first pass stays `59/F` with `102/102` checker-visible figures missing alt.
- A second pass over the `0136` remediated PDF reaches only `80/B`, with `alt_text=20`, after five `set_figure_alt_text` applications and one `retag_as_figure`.
- `0200`, `0296`, and `0325` are not clean alt-first rows in this diagnostic; their remaining debt is heading/table/PDF-UA or protected drift.

Decision:

- Do not promote a one-by-one second-pass alt route; it is too slow and only gets `0136` to `80/B`.
- A future behavior stage, if selected, should first design and test bounded many-figure alt batching on direct checker-visible missing-alt evidence, with protected reanalysis proving real `alt_text`/score movement and no weak-alt/manual-review hiding.
