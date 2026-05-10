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
