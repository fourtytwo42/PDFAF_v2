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
