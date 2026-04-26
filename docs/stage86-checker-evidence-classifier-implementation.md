# Stage 86 Checker Evidence Classifier Implementation

Stage 86 implements the narrow analyzer-side checker-facing evidence classifier
as explicit raw fields on table and paragraph records. It does not change
routing, scoring, gate semantics, or remediation breadth.

## Decision

Keep the classifier as a small metadata-only analyzer change. The sampled
legacy and v1-edge rows now expose an explicit `evidenceState` field, and the
only parked boundary candidate remains separated from wrapper/path artifacts.

## Evidence

- Raw analyzer output now emits `evidenceState` on `tables[]` and
  `paragraphStructElems[]`.
- The classifier uses the Stage 85 policy shape:
  - `checker_facing` when a record is reachable and has direct content or
    subtree MCIDs.
  - `wrapper_path_artifact` when a record is explicitly unreachable with no
    direct content and zero subtree MCIDs.
  - `boundary_candidate` for the remaining mixed cases.
- The sampled corpus still contains one parked boundary candidate on
  `4699`, matching the Stage 85 mixed paragraph boundary without reclassifying
  it as a wrapper/path artifact.
- No scorer, routing, or Stage 41 gate semantics changed.

## Next Work

Keep boundary handling parked until repeat evidence explains whether the
remaining boundary candidate can be preserved safely without broadening
aggregation or adding route guards.
