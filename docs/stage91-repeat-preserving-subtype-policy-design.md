# Stage 91 Repeat-Preserving Subtype Policy Design

Stage 91 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep both boundary subtypes parked and excluded from acceptance reuse. Do not
convert the Stage 90 subtype evidence into a boundary implementation yet.

## Evidence

- Stage 90 isolated two repeat-relevant boundary subtypes:
  - stable `contentless_reachable_boundary` on `4699`
  - intermittent `unreachable_content_bearing_boundary` on `structure-4076`
- The stable subtype remains parked across all sampled reports.
- The intermittent subtype is still not repeat-stable enough for reuse.
- No wrapper/path groups were introduced, so this remains a subtype-design
  stage rather than an implementation signal.

## Policy Draft

- Keep the stable contentless-reachable boundary candidate parked and excluded
  from acceptance reuse.
- Keep the intermittent unreachable-but-content-bearing boundary candidate
  parked until a repeat-preserving policy can prove safe reuse.
- Preserve the subtype distinction in diagnostics instead of collapsing both
  cases into one accept/reuse bucket.
- Treat mixed boundary evidence as insufficient for promotion.

## Guardrails

- No route guards.
- No scorer changes.
- No broad aggregation changes.
- No filename-specific skips or special-case acceptance shortcuts.

## Next Work

If boundary handling is resumed later, it should be a repeat-preserving
subtype-aware policy with fresh evidence. Do not implement boundary promotion
from the current reports alone.
