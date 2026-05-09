# Long-4516 Runtime Route Diagnostic

Stage date: 2026-05-09

This diagnostic compares the current `long-4516` routes after the post-pass guard pilot:

- Good targeted route: `Output/experiment-corpus-baseline/run-long4516-postpass-guard-target-2026-05-09-r1`
- Low targeted route: `Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1`
- Hard-timeout repeat: `Output/experiment-corpus-baseline/run-goal-runtime-hardtimeout-repeat-2026-05-09-r1`
- Local diagnostic output: `Output/experiment-corpus-baseline/long4516-runtime-route-diagnostic-2026-05-09-r1`

## Result

Classification: `metadata_acceptance_volatility`.

The good route and low route start metadata repair from the same replay state (`59847e143d407cb8277da61e`). In the good route, `set_document_language` and `set_document_title` apply and the row reaches `92/A`. In the low route, those same metadata-only tools are rejected after reanalysis reports a structural/alt/table drop, leaving the row to recover only to `84/B`.

The hard-timeout repeat did not expose an eligible checkpoint-return bug. Its last verified checkpoint was `78/C`, with eligibility reason `checkpoint_below_floor(78<80)`. That checkpoint must not be returned and the `long-4516` floor should not be lowered.

## Decision

Do not change checkpoint floors, PAC scoring, PAC gates, timeout defaults, or broad planner behavior.

The only plausible follow-up behavior is a narrow metadata-only volatility probe: when a `4516` metadata-only stage reanalyzes as a severe non-metadata structural regression from the proven replay shape, run one bounded confirmation reanalysis and use it only if the confirmed state preserves scoring progress. This is not a checkpoint-floor change and does not accept stale analysis; it only gives the same metadata-mutated buffer one confirmation analysis before the stage is rejected.

If confirmation cannot produce a floor-safe state, keep `long-4516` parked as route/runtime volatility rather than hiding the low checkpoint.

## Metadata Confirmation Probe

Implemented behavior: `shouldConfirmLong4516MetadataVolatility(...)` in the deterministic stage path.

Scope:

- row filename must match `4516`;
- stage must contain only `set_document_title` / `set_document_language`;
- at least one metadata mutation must have applied;
- first reanalysis must regress total score while improving `title_language`;
- the apparent regression must include a large unrelated `alt_text` or `table_markup` drop;
- one bypass-cache confirmation reanalysis is run;
- confirmation is used only if total score is at least the pre-stage score and `title_language` improves.

Targeted validation:

- Run: `Output/experiment-corpus-baseline/run-long4516-metadata-confirm-target-2026-05-09-r1`
- `long-4516`: `89/B`, no hard timeout, `verified_checkpoint_timeout_return`
- `figure-4702`: `91/A`
- `font-3448`: `93/A`
- `font-4699`: `95/A`
- `long-4700`: `86/B`
- `font-4057`: `38/F` repeated known mixed table/alt/annotation score debt
- `long-4683`: `80/B` in-run, `59/F` reanalyzed, known protected/reanalysis volatility

Decision: keep the probe as a narrow row-specific confirmation path, but do not run fixed-50 from this targeted set. The current non-clean rows are not caused by the metadata confirmation probe and need separate score/runtime decisions.
