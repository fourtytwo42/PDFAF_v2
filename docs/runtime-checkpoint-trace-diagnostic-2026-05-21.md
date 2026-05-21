# Runtime Checkpoint Trace Diagnostic

Date: 2026-05-21

This is a diagnostic-only runtime trace checkpoint for the `4683` tail row. The run used the new explicit `--write-runtime-traces` benchmark flag with `--no-semantic --no-pdfs`; it did not write remediated PDFs, call PAC/POC/ODL/Java/semantic AI, or change production scoring/remediation behavior.

Local artifacts:

- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-4683-2026-05-21-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-4683-2026-05-21-r1/runtime-traces/4683-Illinois_Higher_Education_in_Prison_Task_Force_2022_Report.json`
- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-diagnostic-2026-05-21-r1/runtime-checkpoint-trace-diagnostic.md`
- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-stagnation-4683-2026-05-21-r2/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-stagnation-4683-2026-05-21-r2/runtime-traces/4683-Illinois_Higher_Education_in_Prison_Task_Force_2022_Report.json`
- `/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-diagnostic-2026-05-21-r2/runtime-checkpoint-trace-diagnostic.md`

## Result

Current decision: `plan_live_reanalysis_runtime_probe`

The first focused trace completed:

- score: `48/F -> 59/F`
- wall time: `250669ms`
- deterministic remediation time: `228637ms`
- `false_positive_applied=0`

The trace explains the runtime waste:

| Evidence | Value |
| --- | ---: |
| selected low-score checkpoint created | `21593ms` |
| selected checkpoint score | `59/F` |
| final returned checkpoint time | `228636ms` |
| work after selected checkpoint | `207043ms` |
| reanalysis after selected checkpoint | `63373ms` |
| later applied tools discarded by returned checkpoint | `16` |

The final output already returned the early low-score checkpoint. That means the later work did not affect the final emitted state for this run, but it consumed most of the wall time.

An attempted same-output checkpoint-stagnation proof was then tested but not kept. It did not fire before the expensive stage-6 work; the existing checkpoint return still happened later through the normal timeout path. The second focused trace completed:

- score: `48/F -> 59/F`
- wall time: `227832ms`
- deterministic remediation time: `205773ms`
- `false_positive_applied=0`
- returned checkpoint reason: `return:before_stage`

The updated diagnostic found the stronger next target:

| Evidence | Value |
| --- | ---: |
| selected low-score checkpoint created | `68230ms` |
| final returned checkpoint time | `205772ms` |
| work after selected checkpoint | `137542ms` |
| reanalysis after selected checkpoint | `20855ms` |
| top unaccounted stage | `planner:stage6` |
| stage-6 time not explained by recorded tool time or terminal stage reanalysis | `106395ms` |
| later applied tools discarded by returned checkpoint | `8` |

## Interpretation

The same-output checkpoint idea is real, but it is not the next behavior to promote. The main hidden cost is live per-target analysis inside the figure/alt stage. That work is not represented by the terminal stage `reanalyzeMs` or by recorded Python tool timings, so a checkpoint-stagnation return alone does not address the dominant runtime.

The next proof should target live-reanalysis instrumentation or a guarded per-target reanalysis policy, with these constraints:

- Do not lower normal checkpoint floors.
- Do not lower low-score checkpoint floors or minimum gain.
- Do not suppress PAC evidence or false-positive checks.
- Do not count discarded later repairs as applied.
- Reject if a later checkpoint has a higher score or cleaner verified PAC state.
- Preserve figure/alt repairs on rows where per-target reanalysis proves score or PAC-like benefit.
- Validate controls before accepting; this trace proves only one positive candidate.

## Next Step

Plan a live figure/alt reanalysis runtime proof. The likely safe shape is to record or bound per-target live reanalysis cost and avoid repeated live refreshes when an eligible low-score checkpoint exists, the current stage has not improved score/PAC-visible evidence, and later work would be discarded. This must be validated on `4683` plus controls such as `va-11` and original figure/alt rows where per-target refresh is necessary for real improvements.
