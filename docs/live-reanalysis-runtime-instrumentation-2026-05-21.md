# Live Reanalysis Runtime Instrumentation

Date: 2026-05-21

This is a diagnostic-only runtime evidence stage. It adds native timing telemetry for live analyses performed inside deterministic remediation stages, especially figure/alt per-target refreshes. It does not change scoring, planner routing, mutation behavior, PAC gates, checkpoint floors, API behavior, Docker behavior, or benchmark defaults.

## Source Change

- `RemediationRuntimeSummary.liveAnalysisTimings` records per-stage live analysis duration, context, tool, target ref, and before/after score.
- Runtime trace artifacts include `live_analysis_start` / `live_analysis_finish` events and a compact `liveAnalysisSummary`.
- `runtime-checkpoint-trace-diagnostic` now accounts for live analysis time separately from tool time, terminal stage reanalysis, and remaining unaccounted stage time.

## Local Evidence

Run:

- Input: `/mnt/pdf-review/pdfaf-validation/live-reanalysis-trace-input-2026-05-21-r1`
- Output: `/mnt/pdf-review/pdfaf-validation/live-reanalysis-trace-2026-05-21-r1`
- Diagnostic: `/mnt/pdf-review/pdfaf-validation/live-reanalysis-trace-diagnostic-2026-05-21-r1`
- Mode: Node 22, `--no-semantic --no-pdfs --write-runtime-traces`

Result:

| Row | Final | Wall | `false_positive_applied` | Live Analysis | Key Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| `4683` | `59/F` | `227342ms` | `0` | `3` figure/alt refreshes, `64516ms` total | Stage 6 spent `64516ms` in measured live analysis; the returned low-score checkpoint discarded `183902ms` of later work and `14` later applied tools. |
| `va-11` | `94/A` | `13886ms` | `0` | `3` figure/alt refreshes, `1890ms` total | Outside figure/alt positive remains fast and high-quality under the new telemetry. |

The refreshed checkpoint diagnostic now returns `plan_live_reanalysis_runtime_probe` on `4683`:

- selected low-score checkpoint created at `21344ms`
- returned checkpoint at `205246ms`
- later work after selected checkpoint: `183902ms`
- later stage reanalysis after selected checkpoint: `62837ms`
- top stage: `planner:stage6`
- measured live per-target analysis in top stage: `64516ms`
- remaining unaccounted time in top stage after tool/stage/live accounting: `8ms`

The three measured `4683` figure/alt target refreshes were each about `21.5s`, all with `scoreBefore=59` and `scoreAfter=59`. The control row `va-11` shows that figure/alt live refresh itself is not globally bad; the waste is the repeated slow no-gain pattern on a large low-score row that later returns an early checkpoint anyway.

## Decision

Decision: `plan_guarded_per_target_live_reanalysis_policy`

This evidence supports a narrow behavior proof, not an accepted behavior change yet. The next proof should bound repeated slow `figure_alt_target_reanalysis` only when all of these are true:

- an eligible low-score checkpoint already exists;
- repeated live figure/alt refreshes are slow and produce no score or PAC-visible category gain;
- no later checkpoint has a higher score or cleaner verified state;
- later applied tools would be discarded by the returned checkpoint;
- controls that need figure/alt refresh, including `va-11`, remain stable.

Do not lower checkpoint floors, suppress PAC evidence, claim discarded repairs, or broaden figure/alt routing from this diagnostic.
