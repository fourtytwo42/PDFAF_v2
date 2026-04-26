# Stage 85 Checker Evidence Classifier

Stage 85 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Do not implement the classifier yet. The new explicit table/paragraph metadata
is enough to separate checker-facing evidence from wrapper/path artifacts in
the sampled rows, but one boundary paragraph remains mixed and must stay
parked.

## Evidence

- Stage 85 diagnostic output is local at
  `Output/experiment-corpus-baseline/stage85-checker-evidence-classifier-2026-04-26-r1`.
- Sampled rows covered both legacy and v1-edge corpora:
  - `structure-4076`
  - `long-4683`
  - `long-4470`
  - `fixture-teams-remediated`
  - `font-4172`
  - `short-4214`
  - `4700`
  - `4699`
  - `4722`
- The classifier found `3515` checker-facing groups, `0` wrapper/path groups,
  and `1` mixed boundary group across the sampled rows.
- The mixed boundary group is the paragraph record `paragraph:ref:422_0` on
  `4699`, where `reachable=true` but `directContent=false` and
  `subtreeMcidCount=0`. That is not a wrapper/path artifact and should stay
  parked until a later policy can preserve quality and repeatability together.
- Stable sampled rows such as `structure-4076`, `long-4683`, `long-4470`,
  `fixture-teams-remediated`, `font-4172`, `4700`, and `4722` stayed
  checker-facing across repeats with no wrapper/path evidence.

## Policy Draft

- Treat table/paragraph observations as checker-facing only when `reachable`
  is true and `directContent` is true or `subtreeMcidCount` is nonzero.
- Treat explicitly unreachable observations with zero direct and subtree
  content as wrapper/path artifacts.
- Treat rows that mix checker-facing and contentless reachable states across
  repeats as boundary evidence, not aggregation input.
- Require explicit metadata to be present before inferring artifact status.

## Next Work

Keep Stage 85 diagnostic-only. Any future implementation should be a narrow
checker-facing classifier that handles boundary rows explicitly rather than
expanding aggregation, routing, or scorer behavior.
