# Original-50 Replay Payload Drift Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-replay-payload-drift-diagnostic.ts`, a read-only replay-state payload comparator for the current original-50 route drops:

- `4680`
- `4683`
- `4754`

The diagnostic compares `debug.replayState` payloads from existing remediation JSON only. It reports first replay signatures, first metadata/replay payload category scores, detection-signal count deltas, early events, and whether A-range references share the current low initial route.

It does not analyze PDFs, remediate PDFs, write remediated PDFs, call ODL/PAC/POC/Java/LLM, or change scoring/remediation behavior.

Source:

- `scripts/original50-replay-payload-drift-diagnostic.ts`
- `tests/scripts/original50ReplayPayloadDriftDiagnostic.test.ts`

Local report:

- `/mnt/pdf-review/pdfaf-validation/original50-replay-payload-drift-2026-05-29-r1/original50-replay-payload-drift-diagnostic.md`

## Inputs

Low/current observations:

- `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z/remediate.results.json`
- `/mnt/pdf-review/original50-initial-route-repeat-2026-05-29-r1/run-2026-05-29T18-48-39-015Z/remediate.results.json`

A-range or prior references:

- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-table-wrong-ref-guard-2026-05-28-r3/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-repeated-template-route-2026-05-28-r1/baseline_report.json`
- `/mnt/pdf-review/original50-route-drop-repeat-2026-05-29-r1/run-4754-r1/baseline_report.json`

## Decision

Decision: `diagnose_replay_payload_or_native_analyzer_before_behavior`

Next lane: `native_analyzer_count_stability_or_metadata_after_state_attribution`

This diagnostic confirms that the next useful original-50 work is still upstream route/analyzer attribution, not table-lane reopening and not PAC/category guard relaxation.

## Row Findings

| Row | Current/Repeat | Best References | Classification | Key Evidence |
| --- | ---: | ---: | --- | --- |
| `4680` | `59/F`, `59/F` | `97-98/A` | `replay_payload_count_drift` | Low repeats keep the same first categories but differ in replay detection counts: extracted figures `8->10`, extracted headings `18->19`, tree headings `18->19`. First low signatures differ and no A-range reference shares either low initial signature. |
| `4683` | `59/F`, `59/F` | `94-99/A` | `metadata_stage_after_state_divergence` | A high reference shares the repeat low initial signature, but the metadata-stage after-state diverges. Current rejects `set_document_language` after `reading_order 100->96`; repeat/reference apply from a comparable low state. Low after-state deltas include heading `78->99`, reading order `96->100`, extracted headings `0->2`, and heading depth `4->7`. |
| `4754` | `59/F`, `59/F` | `94/A` | `family_specific_after_stable_route` | Low repeats and several A-range references share the same first replay signature. This makes it a later family-specific side-effect candidate, but it should stay parked until `4680` and `4683` are fixed or formally parked. |

## Interpretation

Do not reopen parked table-heavy outside-source lanes from this evidence.

The original-50 gate is still blocked by upstream state quality:

- `4680` needs replay-state payload count drift attribution. The first category scores look stable, but count-level detection payloads change enough to produce different state signatures and downstream routes.
- `4683` needs metadata-stage after-state attribution. The same row can share a low initial signature with an accepted `99/A` route, but current low runs diverge during or immediately after metadata acceptance.
- `4754` is a better later candidate for controlled side-effect work because the initial route is shared with high references, but it is not the dominant upstream blocker.

No production behavior change is supported yet. No PAC/category guard weakening is supported. No source/file/row/hash gate is supported.

## Next Work

The next diagnostic/implementation branch should stay focused on upstream stability:

- For `4680`, inspect why replay payload counts for headings/figures vary when the first category scores are otherwise stable.
- For `4683`, inspect why metadata-stage after-state extraction can flip between rejected `reading_order 100->96` and accepted A-range continuation from a comparable initial signature.
- Keep `4754` parked as a later family-specific side-effect probe with controls.

Only after `4680` and `4683` are fixed or source-tracked as no-safe-general-fix should the table-heavy outside lanes reopen.
