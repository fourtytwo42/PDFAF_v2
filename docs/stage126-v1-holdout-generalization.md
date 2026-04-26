# Stage 126 v1 Holdout Generalization

Stage 126 creates a third v1-derived holdout batch to verify that current PDFAF v2 behavior generalizes beyond the legacy 50-file corpus and the first two v1 edge mixes.

This is a diagnostic validation stage. It does not change remediation routing, scoring, analyzer behavior, font behavior, protected-baseline semantics, or Stage 41 gate logic.

## Workflow

1. Build the local holdout corpus:

   ```bash
   pnpm run benchmark:stage126-build-holdout -- --out Input/from_sibling_pdfaf_v1_holdout_3
   ```

2. Run deterministic baseline validation with Node 22 and no semantic remediation:

   ```bash
   pnpm run benchmark:edge-mix -- --manifest Input/from_sibling_pdfaf_v1_holdout_3/manifest.json --out Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-baseline-2026-04-26-r1
   ```

3. Repeat the worst or most interesting rows with written PDFs only for the targeted subset:

   ```bash
   pnpm run benchmark:edge-mix -- --manifest Input/from_sibling_pdfaf_v1_holdout_3/manifest.json --out Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-repeat-2026-04-26-r1 --write-pdfs --file <id>
   ```

4. Generate the generalization report:

   ```bash
   pnpm run benchmark:stage126-report -- --run Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-baseline-2026-04-26-r1 --repeat-run Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-repeat-2026-04-26-r1 --out Output/from_sibling_pdfaf_v1_holdout_3/stage126-holdout-generalization-2026-04-26-r1
   ```

## Selection Policy

- Target `30` rows from original cached v1 PDFs, not v1-remediated outputs.
- Exclude files already represented in the legacy corpus, edge-mix 1, edge-mix 2, evolve samples, and recent protected-debug target ids where discoverable.
- Balance the batch across figure/alt, table/link/annotation, font/text extractability, structure/heading/reading order, long/mixed reports, manual/scanned policy cases, and high-score controls.
- Keep PDFs and benchmark outputs local. Only source scripts, manifests, docs, and metadata reports should be considered for commits.

## Pass Criteria

- `30/30` rows complete without benchmark crashes.
- `false_positive_applied = 0`.
- At least `80%` of repeated non-manual, non-volatile rows stay within `5` score points.
- The report identifies the next useful project: stable fixer family, analyzer determinism, runtime tail, or further corpus expansion.

## Result

Stage 126 holdout 3 is complete.

- Corpus: `Input/from_sibling_pdfaf_v1_holdout_3/`
- Baseline run: `Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-baseline-2026-04-26-r1`
- Target repeat: `Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-repeat-2026-04-26-r1`
- Report: `Output/from_sibling_pdfaf_v1_holdout_3/stage126-holdout-generalization-2026-04-26-r1/stage126-holdout-generalization.md`

Baseline result:

- `30/30` completed, `0` errors.
- Mean score `26.33 -> 88.33`; median `28 -> 98.5`.
- Grades after: `20 A / 5 B / 0 C / 0 D / 5 F`.
- A/B rate: `83.3%`.
- False-positive applied: `0`.
- Runtime ms p50/p95/max: `7344.5 / 47777 / 74002`.
- Total tool attempts: `411`.

Target repeat result:

- Repeated `10` rows: the `5` remaining F/manual rows plus the `5` long-report B rows.
- Non-manual, non-volatile repeatability: `7/7` within `5` score points.
- Manual/scanned policy rows repeated exactly at `52/F`.
- Stable non-manual fix candidates: `4002` at `44/F` and `4737` at `59/F`.

Decision:

- Stage 126 passes its diagnostic criteria.
- Current engine generalization is strong on this holdout: `25/30` rows reached A/B and `23` rows are stable engine gains.
- The next useful project is a narrow zero-heading-tail investigation focused on stable rows `4002` and `4737`, not more route guards or analyzer-volatility work.
