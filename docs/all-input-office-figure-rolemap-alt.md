# All-Input Office Figure RoleMap Alt Recovery

This checkpoint targets one PAC-alignment gap found while chasing the all-input mean goal. The row `0207-68e4d50b1554-4213-a-process-and-impact-evaluation-of-the-southwestern-illinois-correctiona.pdf` had strong core structure but failed `alt_text` because Word-exported image nodes used `/InlineShape` instead of PAC/PDF-UA-visible `/Figure` semantics.

## Evidence

- Prior deterministic route: `Output/goal-all-input-mean-2026-05-09-r1/run-0207-current-memdb-2026-05-10-r1`
- Direct repair probe: `Output/goal-all-input-mean-2026-05-09-r1/0207-repair-alt-structure-probe-2026-05-10-r1`
- RoleMap probe: `Output/goal-all-input-mean-2026-05-09-r1/0207-rolemap-inline-figure-probe-2026-05-10-r1`
- Targeted validation: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-alt-image-rolemap-repair-2026-05-10-r1`

The analyzer saw `27` figure-like nodes: `8` checker-visible `/Figure` nodes and `19` reachable content-backed `/InlineShape` nodes. Applying `repair_alt_text_structure` alone filled all missing `/Alt`, but the score stayed `59/F` because the `/InlineShape` roles were still unmapped. Adding absent RoleMap entries `/InlineShape -> /Figure` and `/Shape -> /Figure` moved the probe to `94/A` with `alt_text=100` and no strict PAC score caps.

`Research/POC-decompiled` supports the direction: PAC resolves structure roles through the RoleMap before Figure checks, and its figure alt/BBox/tag checks are scoped to resolved `Figure` structure elements. Leaving Office figure-like roles unmapped is therefore a PAC-visible role-map parity gap, not merely an internal scoring gap.

## Implemented Behavior

- `repair_alt_text_structure` now adds missing RoleMap entries for content-backed Office figure-like roles (`/InlineShape`, `/Shape`) when those roles appear in the structure tree and carry direct or subtree MCID content.
- The planner schedules this deterministic repair only for below-threshold rows with reachable content-backed Office figure-role debt.
- Existing PAC gates, PAC scoring caps, timeout defaults, APIs, AI behavior, and repair tools were not broadened.

## Validation

Focused alt-image validation moved `0207` from `59/F` to `94/A` with `false_positive_applied = 0`. The run also preserved the already recovered proposal-buffer rows in the subset (`0119`, `0306`, `0318`) and did not introduce false-positive evidence.

Progress overlay after adding the focused run:

- Output: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0207-office-rolemap-alt-2026-05-10-r1`
- Mean estimate: `92.0484 -> 92.1481`
- Rows below target: `88 -> 87`
- Remaining points needed for mean `93`: `334 -> 299`
- Grade distribution: `324 A / 8 B / 6 C / 9 D / 4 F`

## Remaining Work

This recovered one high-value alt row but the overall goal still needs about `299` points. The next selection should avoid widening table/header or font/CMap behavior from this evidence. Good next lanes are remaining heading/reading route-repeatability rows, source-proven semantic rows, or a single object-level table/structure proof where PAC object evidence is stable.
