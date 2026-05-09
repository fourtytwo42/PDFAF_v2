# Long-4516 Post-Pass Guard Validation

This stage adds one row-specific runtime pilot for `long-4516`.

## Behavior

The guard is limited to `long-4516` and only fires after:

- the current state is at least `84/B`;
- `set_pdfua_identification` has already applied as a score-moving post-pass; and
- the next work would be the orphan-MCID drain post-pass.

When those conditions hold, the guard records `long4516_orphan_drain_postpass_guard` and skips the orphan-drain tail. It does not skip planner work, score-moving annotation/list repair, alt repair, PDF/UA top-up, or any other row.

The proof came from targeted repeat `Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1`, where `long-4516` reached `84/B` and then spent about `23s` on a no-gain orphan-drain pass.

## Validation

Targeted validation:

- `Output/experiment-corpus-baseline/run-long4516-postpass-guard-target-2026-05-09-r1`

Rows:

- Target: `long-4516`
- Score/runtime controls: `font-4057`, `font-3448`, `figure-4702`, `long-4683`, `long-4700`, `font-4699`, `font-4035`

Result:

- `long-4516` completed at `92/A` with no hard timeout.
- The guard did not fire in this repeat because the route changed and the orphan-drain pass was score-moving (`89 -> 92`), so the guard correctly preserved it.
- `figure-4702` stayed `91/A`.
- `font-3448` stayed `93/A`.
- `font-4699` and `font-4035` stayed A-grade.
- `long-4700` stayed `86/B`.
- `font-4057` remained the documented `38/F` mixed table/alt/annotation debt.
- `long-4683` remained volatile: it reached `92/A` in-run but protected reanalysis landed at `60/D`.

## Decision

Keep the guard as a narrow pilot because it is row-scoped and did not suppress score-moving work in validation. Do not run fixed-50 from this stage yet: targeted validation is not clean because `font-4057` remains a real score blocker and `long-4683` remains protected/reanalysis volatility.

Next work should not broaden this guard. Either restore the Stage 42 protected baseline and run an exact gate, or continue with the explicitly documented remaining blockers: `font-4057` mixed table/alt/annotation debt and `long-4683` protected/reanalysis volatility.

## Hard-Timeout Repeat

Follow-up runtime repeat:

- `Output/experiment-corpus-baseline/run-goal-runtime-hardtimeout-repeat-2026-05-09-r1`

Result for `long-4516`:

- Hard timeout repeated.
- Timeout trace last phase: `verified_checkpoint`.
- Last verified checkpoint: `78/C`, below the row floor `80/B`.
- Eligibility reason: `checkpoint_below_floor(78<80)`.
- Last checkpoint reason: `stage181_hidden_alt_post_pass`.

Decision: do not lower the row floor and do not return the `78/C` checkpoint. The remaining `long-4516` failure is a real runtime-tail path that does not expose a safe checkpoint in this repeat. Any future runtime work must prove an earlier score-moving route or a same-state no-gain loop before behavior changes.
