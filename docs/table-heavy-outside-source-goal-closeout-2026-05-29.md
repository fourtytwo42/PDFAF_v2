# Table-Heavy Outside-Source Goal Closeout - 2026-05-29

## Summary

Decision: `complete_via_accepted_lanes_and_parked_remaining_table_lanes`.

The table-heavy outside-source goal is closed through the second completion
endgate: every current high-impact table lane is either accepted as a general,
PAC-honest, object-backed fix or parked with source-tracked evidence explaining
why it cannot be safely generalized now.

This closeout adds no scorer change, remediation behavior, PAC exception,
source gate, filename gate, row gate, hash gate, ODL/PAC/POC runtime call,
semantic/LLM dependency, or generated PDF artifact.

## Accepted Table Improvements

Accepted source changes are committed and pushed:

- `eeac1d6` / `docs/repeated-template-table-finalization-route-2026-05-28.md`
  - Repeated-template table finalization for high-volume real `/Table`
    template clusters.
  - WV DCR PREA proof: mean `98.25`, all A, `false_positive_applied=0`.
  - Oklahoma DOC PREA proof: mean `99.50`, all A,
    `false_positive_applied=0`.
  - Original-50 gate: mean `94.32`, median `95`,
    `false_positive_applied=0`, no hard timeouts.
- `70efb1c` / `docs/table-heavy-object-backed-large-batch-2026-05-27.md`
  - Large object-backed strongly-irregular table batch.
  - Proof-pack movement: `pscan-06 69/D -> 94/A`,
    `pscan-08 69/D -> 95/A`.
  - Original-50 gate: mean `94.2400`, median `95.5`,
    `false_positive_applied=0`, no hard timeouts.
- `7c25b42` / `docs/table-empty-row-regularity-cleanup-2026-05-27.md`
  - Empty `/TR` cleanup before existing table normalization, guarded by
    no cells, no MCIDs, no `/OBJR`, and no text metadata.
  - Proof-pack movement: `mtcourts-05 69/D -> 89/B`,
    `mtcourts-09 69/D -> 89/B`.
  - Original-50 accepted gate r1: mean `94.34`, median `95`,
    `false_positive_applied=0`, no hard timeouts.
- `docs/us-courts-judicial-business-tables-holdout-2026-05-26.md`
  - Leading-empty-row table header promotion and association was accepted as a
    general native repair.
  - Original-50 gate: mean `94.24`, median `95`,
    `false_positive_applied=0`, no hard timeouts.
- `docs/table-wrong-ref-guard-and-association-only-proof-2026-05-28.md`
  and `docs/table-mcr-pg-evidence-correction-2026-05-28.md`
  - Wrong-ref rejection and `/MCR /Pg` evidence correction keep table
    behavior object-backed and PAC-honest.

## Parked Remaining Lanes

Remaining table-heavy lows are not accepted behavior lanes:

- Montana broader empty-row/post-pass follow-up:
  - `docs/table-empty-row-regularity-followup-parked-2026-05-28.md`
  - It can lift `mtcourts-05`/`mtcourts-09` to A-range, but failed the
    required original-50 gate through existing original-control route/runtime
    volatility. The behavior was reverted before commit.
- Montana/U.S. Courts missing-header batch and ownership preservation:
  - `docs/table-missing-header-batch-proof-2026-05-28.md`
  - `docs/table-mcid-ownership-attribution-diagnostic-2026-05-28.md`
  - `docs/table-mcid-traversal-stability-parked-2026-05-28.md`
  - Strict real-`/Table` batching gives small table progress, but does not
    produce enough final score movement and exposed analyzer/orphan-MCID
    attribution contradictions. Stable object-key traversal remains
    diagnostic-only because it failed the original-50 floor.
- U.S. Courts residual lows:
  - `docs/table-goal-blocker-rollup-2026-05-28.md`
  - `uscourts-01` and `uscourts-04` are mixed zero-heading/table debt, not a
    table-only repair predicate.
- Public Safety Canada residual target-resolution family:
  - `docs/public-safety-canada-corrections-publications-holdout-2026-05-26.md`
  - The accepted large-batch route covers the clean object-backed PSCAN
    positives. The remaining PSCAN table lows include prior non-table target
    resolution, control overlap, or runtime/analyzer debt.
- Broad strict transaction rescue:
  - `docs/table-transaction-side-effect-attribution-2026-05-27.md`
  - `docs/table-heavy-outside-source-transaction-stage-2026-05-27.md`
  - Blocked by wrong-ref history, control table movement, and non-table PAC
    side-effect evidence.

## Final Gate

The current accepted table work materially improves table-heavy public holdouts
without hiding failures:

- table fixes are native and object-backed;
- non-`/Table` targets are blocked from table repair paths;
- `false_positive_applied=0` on accepted validations;
- accepted original-50 gates meet or preserve the floor;
- no accepted scorer masking, PAC suppression, source/file/row/hash gates, or
  semantic dependency was introduced;
- generated public PDFs and proof artifacts remain local scratch only and are
  not source assets.

The practical next work is outside this table-heavy goal: original-control
runtime/route stabilization and mixed heading/table diagnostics. Do not broaden
table admission to chase the parked rows.
