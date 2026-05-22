# Slow No-Gain Figure/Alt Live Reanalysis Guard

Date: 2026-05-21

This is a narrow runtime behavior proof for repeated slow no-gain figure/alt live reanalysis. It does not change scoring, PAC gates, checker evidence, mutation truth, planner admission, figure/alt target selection, checkpoint floors, Docker/API defaults, or semantic behavior.

## Source Change

The deterministic orchestrator may now return an already eligible low-score checkpoint during `set_figure_alt_text` processing when all of these are true:

- a low-score checkpoint already satisfies the existing general low-score checkpoint safety gate;
- the current score is still no better than that checkpoint;
- the current score is low (`<=69`);
- the counted refreshes start from the same low-score state rather than from a higher-score route;
- repeated `figure_alt_target_reanalysis` refreshes are slow (`>=2` refreshes, `>=40000ms` total, each counted refresh `>=10000ms`);
- those refreshes do not improve overall score, `alt_text`, or `pdf_ua_compliance`.
- no refresh in the figure/alt stage has produced overall score, `alt_text`, or `pdf_ua_compliance` gain.

The return reason is `verified_low_score_checkpoint_slow_no_gain_figure_alt_return`. This preserves the verified checkpoint state and drops later unproven work rather than counting discarded repairs.

## Target Evidence

Target/control run:

- Input: `/mnt/pdf-review/pdfaf-validation/live-reanalysis-trace-input-2026-05-21-r1`
- Output: `/mnt/pdf-review/pdfaf-validation/slow-no-gain-figure-alt-guard-2026-05-21-r1`
- Mode: Node 22, `--no-semantic --no-pdfs --write-runtime-traces`

| Row | Result | Wall | `false_positive_applied` | Guard |
| --- | ---: | ---: | ---: | --- |
| `4683` | `48/F -> 59/F` | `162393ms` | `0` | fired |
| `va-11` | `51/F -> 94/A` | `11666ms` | `0` | did not fire |

Compared with the prior telemetry run, `4683` preserved the same final score while reducing wall time from `227342ms` to `162393ms` (`-64949ms`). The guard returned the `stage_4` low-score checkpoint (`59/F`, `8` applied tools) at `140175ms`, before the later post-pass path that previously returned a low-score checkpoint at `205246ms`.

`va-11` is the outside figure/alt quality-positive control. It still reached `94/A`; its figure/alt live analyses totaled only `1864ms`, so the slow no-gain guard did not trigger.

A stricter repeat was then run after adding the "started from low-score state" safety check:

- Output: `/mnt/pdf-review/pdfaf-validation/slow-no-gain-figure-alt-guard-2026-05-21-r2`
- `4683`: `48/F -> 59/F`, `255466ms`, `false_positive_applied=0`
- `va-11`: `51/F -> 94/A`, `13916ms`, `false_positive_applied=0`

On this repeat, `4683` had the same three slow score-neutral figure/alt refreshes, but the guard did not fire; the run continued to the normal `verified_low_score_checkpoint_timeout_return`. This is acceptable safety behavior, not a quality failure: when the route exposes PAC-visible movement or does not satisfy the final strict predicate, the guard stays out of the way. It also means the runtime gain is route-dependent and not yet a broad accepted p95 fix.

## Original Figure/Alt Controls

Control run:

- Input: `Input/experiment-corpus/20-figure-ownership`
- Output: `/mnt/pdf-review/pdfaf-validation/slow-no-gain-figure-alt-original-figure-controls-2026-05-21-r1`
- Mode: Node 22, `--no-semantic --no-pdfs --write-runtime-traces`

Result: `10/10` completed, mean `96.1`, `false_positive_applied=0`, and `0` guard triggers.

Rows:

- `4082`: `98/A`
- `4184`: `98/A`
- `4188`: `98/A`
- `4194`: `93/A`
- `4466`: `97/A`
- `4609`: `94/A`
- `4702`: `93/A`
- `4753`: `97/A`
- `4754`: `94/A`
- `4755`: `99/A`

The slowest controls remained governed by existing routes (`4702` at `164312ms`, `4754` at `85095ms`) and did not trigger this guard.

## Original-50 Validation

Fresh bounded original-50 validation was run after the guard and symlink-safe bounded runner update:

- Input: `/mnt/pdf-review/pdfaf-validation/original50-input-2026-05-21-guard-r1`
- Output: `/mnt/pdf-review/pdfaf-validation/original50-slow-no-gain-guard-bounded-2026-05-21-r1`
- Mode: Node 22, deterministic `--no-semantic --no-pdfs`, one PDF per child process, external per-PDF timeout `300000ms`

Result:

- `50` rows counted, `49` completed.
- All-row mean `92.24`; completed-row mean `94.1224`; median `96`.
- Grades: `45 A / 2 B / 0 C / 0 D / 2 F / 1 ?`.
- `false_positive_applied=0`.
- One hard timeout: `structure-4438`, the existing known timeout debt.
- p95/max wall: `237114ms / 300041ms`.
- No broad-run artifact contained `verified_low_score_checkpoint_slow_no_gain_figure_alt_return`.

Rows below `93` or errored:

| Row | Result | Wall | Note |
| --- | ---: | ---: | --- |
| `font-4172` | `59/F -> 59/F` | `18432ms` | broad-run route volatility; focused repeat recovered to `93/A` |
| `long-4516` | `43/F -> 87/B` | `258640ms` | low but no hard timeout |
| `long-4683` | `48/F -> 59/F` | `227451ms` | completed instead of timing out; guard did not fire in this broad route |
| `structure-4076` | `31/F -> 89/B` | `237114ms` | known analyzer/runtime tail |
| `structure-4438` | `n/a -> timeout` | `300041ms` | existing known hard timeout debt |

The focused `font-4172` repeat is `/mnt/pdf-review/pdfaf-validation/font4172-focus-repeat-2026-05-21-r1`; it completed `59/F -> 93/A` with `false_positive_applied=0`, so the broad-run `4172` drop is not treated as a stable guard-caused regression.

Follow-up p95-aware validation showed the broader current scorer/runtime stack is still not accepted as a runtime gate:

- `/mnt/pdf-review/pdfaf-validation/original50-current-treecap-guard-bounded-repeat-2026-05-21-r2`
- `49/50` completed, all-row mean `91.82`, completed-row mean `93.6939`, `false_positive_applied=0`;
- known timeout `structure-4438`;
- p95 `253462ms` versus Form XObject confidence reference `229628ms`, allowed `236517ms`;
- `4516` and `4680` repeated low-score route volatility.

This does not invalidate the narrow guard predicate, but it means the guard must not be counted as a broad p95/runtime acceptance fix.

## Decision

Decision: `accepted_narrow_runtime_guard_route_dependent`

This is safe enough to keep as a narrow runtime guard because it preserves score/PAC visibility, does not lower any checkpoint floor, did not trigger on focused outside/original controls, and the fresh original-50 evidence kept `false_positive_applied=0` with no new hard-timeout family. The runtime benefit remains route-dependent: it fired on one no-gain `4683` route, stayed parked on a stricter repeat, and did not fire in the broad original-50 route. Do not count this as a broad p95 fix or as acceptance of the provisional tree-cap scorer; count it only as a PAC-honest safety guard against repeated slow no-gain figure/alt reanalysis when the strict predicate is met.
