# Stage 92 Boundary Subtype Evidence Expansion

Stage 92 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep the boundary subtypes parked. The expanded evidence is still not strong
enough to justify a repeat-preserving implementation on the mini model, so the
stage is blocked from policy changes until a higher-confidence design pass is
run.

## Evidence

- Expanded evidence lives at
  `Output/experiment-corpus-baseline/stage92-boundary-subtype-evidence-expansion-2026-04-26-r1`.
- The combined stage85 through stage91 evidence keeps the two repeat-relevant
  subtypes distinct:
  - `contentless_reachable_boundary` on `4699`
  - `unreachable_content_bearing_boundary` on `structure-4076`
- `4699` is corroborated by raw, repeat, and policy evidence and stays parked.
- `structure-4076` still only appears intermittently in the repeat/policy
  samples and remains parked.
- No wrapper/path groups were introduced, so the remaining work is still
  boundary subtype policy design rather than an implementation signal.

## Implication

Do not collapse the two boundary subtypes into one accept/reuse bucket. If
boundary handling is resumed, it should be a repeat-preserving subtype-aware
policy validated with fresh evidence and a higher-confidence model run.

## Next Work

Rerun Stage 92 with `--model-policy xhigh` if the goal is to design an actual
repeat-preserving boundary policy. Otherwise keep both boundary subtypes
parked and excluded from acceptance reuse.
