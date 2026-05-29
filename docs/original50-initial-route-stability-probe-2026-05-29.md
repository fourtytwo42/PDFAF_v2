# Original-50 Initial Route Stability Probe

Date: 2026-05-29

## Summary

Added a read-only probe for the current original-50 route drops:

- `4680`
- `4683`
- `4754`

The probe compares two current deterministic low observations against accepted/focused high references. It reads existing JSON only:

- `analyze.results.json`
- `remediate.results.json`
- prior `baseline_report.json` reference artifacts

It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.

Source script:

- `scripts/original50-initial-route-stability-probe.ts`

Local report:

- `/mnt/pdf-review/pdfaf-validation/original50-initial-route-stability-probe-2026-05-29-r1/original50-initial-route-stability-probe.md`

Observation inputs:

- `current`: `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z`
- `repeat`: `/mnt/pdf-review/original50-initial-route-repeat-2026-05-29-r1/run-2026-05-29T18-48-39-015Z`

The repeat kept all three rows at `59/F`, with `false_positive_applied=0`.

## Decision

Decision: `diagnose_analyzer_or_replay_state_before_behavior`

Next lane: `native_analyzer_or_replay_signature_stability_probe`

Two selected rows need analyzer/replay-state stability before any behavior promotion. The third row is a later family-specific candidate, but should not drive broad behavior while the original-50 gate is still blocked by upstream route instability.

## Row Classifications

| Row | Observed Scores | Best Reference | Classification | Key Evidence |
| --- | --- | ---: | --- | --- |
| `4680` | `59/F`, `59/F` | `98/A` (`focus-r1`) | `stable_low_replay_signature_drift` | Initial categories/signals are stable, but low repeats have two different first replay signatures and no high reference shares either signature. |
| `4683` | `59/F`, `59/F` | `99/A` (`accepted-wrongref`) | `unstable_initial_analysis` | Initial `heading_structure` swings `43 -> 99`; extracted/root-reachable headings swing `1 -> 21`; figures swing `5 -> 14`; irregular tables swing `0 -> 3`. |
| `4754` | `59/F`, `59/F` | `94/A` (`accepted-wrongref`) | `family_specific_after_stable_route` | Current low repeats share the same first replay signature; two high references share that signature and one also shares the early route key, so later figure/table side-effect work may be probeable with controls. |

## Interpretation

Do not reopen parked table-heavy outside-source lanes from this evidence.

The current original-50 gate is still controlled by upstream route stability:

- `4680` needs replay-state signature or hidden-state drift attribution.
- `4683` needs native analyzer count/drop variance attribution.
- `4754` is closer to a later side-effect probe, but it should not become the main behavior lane while `4680` and `4683` remain original-50 gate blockers.

No PAC/category guard weakening is supported. No source/file/row/hash gate is supported.

## Next Work

The next useful diagnostic should focus on the native analyzer or replay-state source of variance:

- For `4680`, compare what enters the replay-state signature when initial categories/signals are stable but signatures differ.
- For `4683`, compare analyzer count/drop sources behind heading, figure, and table signal swings.
- Keep `4754` parked as a later family-specific side-effect candidate until the upstream original-50 blockers are fixed or formally parked.

