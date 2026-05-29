# Original-50 Replay Payload Code Attribution

Date: 2026-05-29

## Summary

Follow-up inspection after `docs/original50-replay-payload-drift-diagnostic-2026-05-29.md` attributes the current `4680` and `4683` blockers to count-sensitive replay payload inputs, not to a missing table behavior.

No source behavior changed in this note.

## Relevant Code Path

Replay instrumentation is built in `src/services/remediation/orchestrator.ts`:

- `buildReplayState` builds `stateSignatureBefore` and `stateSignatureAfter`.
- The hashed payload includes:
  - current score;
  - category scores;
  - `replayDetectionSignals`;
  - target ref and params when present.
- `replayDetectionSignals` includes count-sensitive values such as:
  - `extractedHeadingCount`;
  - `treeHeadingCount`;
  - `checkerVisibleFigureCount`;
  - `checkerVisibleFigureAltCount`;
  - `extractedFigureCount`;
  - `treeFigureCount`;
  - table/annotation/orphan counts.

Those values are derived from the current `DocumentSnapshot` and `DetectionProfile`, including `snapshot.headings.length`, `snapshot.figures.length`, checker-visible figure targets, and bounded detection signals from `src/services/detection/boundedDetection.ts`.

## Row Attribution

### `4680`

The replay payload drift diagnostic classifies `4680` as `replay_payload_count_drift`.

The low repeats have stable first category scores, but the first replay detection payload changes:

- `extractedFigureCount`: `8 -> 10`
- `extractedHeadingCount`: `18 -> 19`
- `treeHeadingCount`: `18 -> 19`

Because these signals are part of the replay-state hash payload, small analyzer/snapshot count drift creates different first state signatures and different downstream route identity. This is not evidence for table-lane reopening or PAC guard relaxation.

Safe next work:

- diagnose why the snapshot/replay payload counts vary before any tool-specific behavior is promoted;
- do not solve this by deleting detection counts from replay signatures unless a separate proof shows no loss of safety for same-state no-gain/runtime suppression.

### `4683`

The replay payload drift diagnostic classifies `4683` as `metadata_stage_after_state_divergence`.

At least one high reference shares the repeat low initial signature, but the first metadata-stage after-state diverges:

- current low route rejects `set_document_language` after a `reading_order 100->96` regression;
- repeat/reference routes apply from a comparable low initial state;
- low after-state deltas include heading score, reading order, extracted heading count, extracted figure count, and heading tree depth.

This means the guarded rejection is not merely a hash-format problem. The next useful lane is metadata-stage after-state attribution: determine why the same broad metadata operation can lead to different extraction/reading-order states, and only then consider a general stabilizer.

## Decision

Keep table-heavy outside lanes parked.

Next stage should be one of:

1. `4680` native analyzer/replay count stability diagnostic.
2. `4683` metadata-stage after-state attribution diagnostic.

Do not add:

- scorer masking;
- PAC/category regression suppression;
- source/file/row/hash gates;
- broad replay-signature pruning;
- table admission changes from this evidence.
