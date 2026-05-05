# PAC Promotion Readiness Decision Report

This stage adds a diagnostic selector for deciding which POC/PAC-derived rule evidence is ready to promote later. It does not change scoring, remediation gates, planner routing, mutation behavior, API responses, benchmark policy, rendered contrast, network link checking, or AI behavior.

## How To Run

Preferred flow after a strong-area diagnostic run:

```bash
pnpm exec tsx scripts/pac-promotion-readiness.ts \
  --matrix Output/poc-strong-areas-diagnostic/poc-strong-rule-matrix.json \
  --out Output/pac-promotion-readiness
```

Direct analysis flow:

```bash
pnpm exec tsx scripts/pac-promotion-readiness.ts \
  --input Input/experiment-corpus \
  --out Output/pac-promotion-readiness
```

Generated artifacts stay under `Output/` and are not committed.

## Promotion Criteria

Safe scoring candidates must be verified `fail` rows where the mapped category is applicable and already passing at `REMEDIATION_CATEGORY_THRESHOLD` or above. This stage only reports those contradictions; a later stage must explicitly add any selected rule to the existing score-cap model.

Safe gate candidates must be verified structural or checker-facing failures from the selected gate rule set. A later stage may gate only rules that can regress during deterministic structural mutations.

Noisy rows remain diagnostic-only when they are `warn`, `heuristic`, `manual_review_required`, optional checks not run, or failures without a stable passing-category contradiction.

## Current Safe Candidate Families

The selector evaluates these scoring-cap families first:

- RoleMap and structure reference validity.
- ParentTree MCID entry validity.
- Text/image content tagged-or-artifacted evidence.
- Table header association evidence.
- Verified font/CMap failures only when category-pass gaps repeat.

The selector evaluates these gate families first:

- Parent links, MCR/OBJR shape, child-role validity, and RoleMap validity.
- ParentTree MCID entry validity.
- Text/image/artifact tagging boundary evidence.
- Table header association evidence.

## Diagnostic-Only Areas

Rendered contrast stays opt-in/manual-review because reliable measurement depends on rendering, geometry, background sampling, transparency, and page sampling quality.

Link reachability stays opt-in/manual-review because deterministic benchmark and remediation paths must not depend on network availability or remote server behavior.

AI visual-tag mismatch stays opt-in/manual-review because it is semantic evidence for triage, not stable enough for default mutation, scoring, or acceptance gates.

## Recommended Next Stage

Run `scripts/pac-promotion-readiness.ts` across the current benchmark and holdout matrices. Promote only the highest-frequency verified scoring candidates into the existing 89-point cap path, and separately promote only repeated structural/checker-facing gate candidates that can regress during deterministic mutations.
