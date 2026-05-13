# All-Input Low Checkpoint Timeout Diagnostic

This diagnostic is for the long-running all-input mean goal. It does not change scoring, PAC gates, timeout defaults, planner routes, mutation behavior, or checkpoint floors.

Artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/low-checkpoint-timeout-diagnostic-2026-05-10-r1/`

Input comparison:

- Runtime traces from `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-10-r1`
- Latest overlay rows from `Output/goal-all-input-mean-2026-05-09-r1/fresh-overlay-runtime-route-reading-shell-2026-05-10-r1/all-input-rows.merged.json`

Result:

- Hard-timeout rows: `9`
- Below-floor checkpoint rows needing safety replay: `7`
- Low checkpoint too poor to drive the goal safely: `2`
- Projected points if safety replay passes: `428`
- Projected overlay mean if those safe returns were accepted: `92.6011`

Candidate rows needing safety replay:

- `0223-1d48e47df89a-4105-evaluation-of-the-jail-data-link-program`: best checkpoint `68/D`
- `0120-a9de52a274a8-4690-evaluation-of-the-development-of-a-multijurisdictional-police-led-deflec`: best checkpoint `65/D`
- `0020-cbe531e850f8-long-4683`: best checkpoint `59/F`
- `0085-e82f2da97632-4215-juvenile-justice-data-2008`: best checkpoint `59/F`
- `0135-a924a15180cf-4453-juvenile-justice-in-illinois-2014`: best checkpoint `59/F`
- `0136-1557962e554c-4503-2019-illinois-methamphetamine-study`: best checkpoint `59/F`
- `0208-d966f95ddc9f-4446-women-and-reentry-evaluation-of-the-st-leonard-s-ministries-grace-house-`: best checkpoint `59/F`

Parked timeout rows:

- `0217-852330f00c46-3427-specification-of-patterns-over-time-in-chicago-homicide-increases-and-de`: best checkpoint `44/F`
- `0031-9d63e648dc78-structure-4438`: best checkpoint `36/F`

Decision:

Do not lower checkpoint floors directly from this evidence. Existing eligibility checks evaluate the score floor before page/text/tag/PAC safety, so a `checkpoint_below_floor(...)` trace does not prove the checkpoint is safe. The next runtime stage should add or run a safety replay that evaluates the same checkpoint without the score floor, and only then consider an honest low-score timeout return. Even if all seven candidates pass, the projected mean is still below `93`, so another score lane remains necessary.

Follow-up implementation:

- Added a row-scoped `verified_low_score_checkpoint_timeout_return` path for only the seven diagnostic candidate filenames.
- This path does not change normal verified checkpoint floors; it evaluates false-positive, score improvement, page/text/tag safety, and PAC gate safety before allowing the low-score return.
- `structure-4438` and `0217` are excluded.
- `baseline-corpus-batch.ts` treats both normal and low-score checkpoint returns as terminal so a returned checkpoint is not sent into a second deterministic pass.

Targeted validation:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-low-checkpoint-timeout-target-2026-05-10-r1`
- `false_positive_applied = 0`
- Completed without hard timeout:
  - `4215`: `25/F -> 59/F`
  - `4690`: `25/F -> 75/C`
  - `4453`: `30/F -> 59/F`
  - `4503`: `30/F -> 59/F`
  - `4105`: `25/F -> 68/D`
- Still hard-timeout:
  - `long-4683`
  - `4446`
- Updated planning overlay: `Output/goal-all-input-mean-2026-05-09-r1/fresh-overlay-low-checkpoint-timeout-target-2026-05-10-r2`
  - mean `92.2934`
  - rows below target `56`
  - points still needed for mean `93`: `248`

The low-score return path is honest runtime recovery, not quality recovery. The next stage still needs a score-moving lane worth at least `248` points, or additional timeout/route recovery plus score movement.

Generalized follow-up:

- The row-scoped low-score timeout allow-list has been replaced with a general material-safe checkpoint predicate.
- The low-score timeout path is now filename-independent and requires:
  - near-wall budget pressure
  - at least one applied tool in the checkpoint
  - checkpoint score `>= 50`
  - checkpoint score gain `>= 10`
  - no mutation-truth false-positive evidence
  - page/text/tag snapshot preservation
  - no PAC-rule acceptance regression from the checkpoint tool prefix
- Normal verified checkpoint floors are unchanged.
- This keeps the runtime-return behavior based on repair evidence and state safety rather than known row identity.

## Normal Floor Generalization

The normal verified-checkpoint return path is also filename-independent now:

- standard verified checkpoints use floor `85`;
- severe initial structural failure states use the stricter floor `90` when the
  initial score is at most `30` and heading, link, PDF/UA, and title/language
  evidence are all severely absent;
- sub-`85` returns must use the low-score checkpoint predicate above.

This removes the former `structure-4076`, `long-4516`, `long-4683`, and
`structure-4438` filename floor exceptions without lowering the strict floor for
severe structure failures.

Focused validation:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-general-timeout-checkpoint-2026-05-13-r1`
- Input: four r19 hard-timeout rows plus four timeout-return controls, deterministic `--no-semantic --no-pdfs`
- `false_positive_applied = 0`
- Completed without hard timeout:
  - `0019/long-4516`: `58/F -> 85/B`
  - `0114/4587`: `30/F -> 59/F`
  - `0120/4690`: `53/F -> 63/D`
  - `0136/4503`: `44/F -> 59/F`
  - `0208/4446`: `40/F -> 59/F`
  - `0223/4105`: `25/F -> 59/F`
  - `0296`: `30/F -> 73/C`
- Still hard-timeout:
  - `0031/structure-4438`

Decision:

Keep the generalized predicate as a runtime-boundedness improvement candidate, not a completion claim. It removes filename-specific production gates and recovers meaningful scores on timeout-heavy rows, but the focused validation still leaves substantial score debt and `structure-4438` unresolved. A fresh all-unique-PDF run is still required before this can count toward closing the all-input mean goal.

## State-Floor Follow-Up Validation

After normal checkpoint floors were made filename-independent, the focused
timeout set was rerun:

- Run:
  `Output/goal-all-input-mean-2026-05-09-r1/run-general-timeout-checkpoint-state-floor-2026-05-13-r1`
- Command shape: deterministic `baseline-corpus-batch.ts --no-semantic --no-pdfs`
- `false_positive_applied = 0`

Results:

| Row | Result |
| --- | ---: |
| `0019/long-4516` | `43/F -> 55/F` |
| `0031/structure-4438` | hard timeout, best checkpoint `36/F` below the severe-state `90` floor |
| `0114/4587` | `30/F -> 59/F` |
| `0120/4690` | `54/F -> 75/C` |
| `0136/4503` | `44/F -> 59/F` |
| `0208/4446` | `40/F -> 97/A` |
| `0223/4105` | `25/F -> 59/F` |
| `0296` | `30/F -> 77/C` |

The state-floor validation is useful for generalization, but it is not mean
progress evidence: `long-4516` did not reproduce the earlier B-grade route,
while `0208` did reproduce a high route. Treat the result as runtime-policy
validation plus continued route volatility, not as a fresh full-run checkpoint.
