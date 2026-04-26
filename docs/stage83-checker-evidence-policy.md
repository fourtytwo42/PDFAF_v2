# Stage 83 Checker Evidence Policy

Stage 83 is diagnostic-only. It adds no remediation, analyzer-output, scorer, planner, route-guard, or gate behavior change.

## Decision

Do not implement deterministic table/paragraph aggregation yet. The Stage 81 intermittent table and paragraph evidence cannot be safely classified as checker-facing structure from the current raw analyzer shape.

## Evidence

- Stage 82 selected Stage 83 as a checker-aligned table/paragraph policy design before any Python traversal, aggregation, or scoring-adjacent behavior is changed.
- Stage 81 found intermittent table evidence on `structure-4076`, `long-4683`, and `long-4470`.
- The current Python table records expose table shape (`headerCount`, `totalCells`, `rowCount`, regularity fields), but they do not emit explicit `reachable`, `directContent`, `subtreeMcidCount`, or `parentPath`.
- The current Python paragraph records expose text/page/ref fields, but they also do not emit explicit root-reachability or direct/subtree content ownership fields.
- Therefore, Stage 81 merged `false` reachability/content values are not safe policy evidence: missing metadata and explicit negative evidence collapse together.

## Policy Draft

- Treat table/paragraph observations as checker-facing only when the raw analyzer explicitly proves root reachability and either direct MCID content or nonzero subtree MCID content.
- For tables, use header/row/regularity evidence only after checker-facing ownership is proven.
- For paragraphs, use paragraph structure for reading-order or heading bootstrap only after root-reachable, content-bearing ownership is proven.
- Treat explicitly unreachable or contentless table/paragraph observations as wrapper/path artifacts.
- Do not infer artifact status from missing metadata.

## Next Stage

Stage 84 should be metadata-only analyzer instrumentation for table and paragraph records. It should add `reachable`, `directContent`, `subtreeMcidCount`, and `parentPath` to raw analyzer output, then repeat the Stage 81 raw same-buffer diagnostic on protected rows and stable controls before any aggregation/filter behavior is attempted.
