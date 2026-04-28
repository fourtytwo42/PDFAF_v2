# Stage 146 Tail Corpus Workflow

Stage 146 and later fixer stages should use the active low-grade tail corpus for fast iteration, then protect the original 50-file corpus as the regression gate.

## Current Corpora

- Raw current tail: `Input/stage145-low-grade-tail/manifest.json`
  - 37 rows from the Stage 145 combined view.
  - Baseline grades: `16 C / 11 D / 10 F`.
- Active current tail: `Input/stage145-active-low-grade-tail/manifest.json`
  - 30 rows after rerunning the raw tail once and removing rows that repeated into A/B.
  - Baseline run: `Output/stage145-low-grade-tail/run-stage145-tail-baseline-2026-04-28-r1`
  - Baseline grades: `12 C / 8 D / 10 F`.
- Regression gate: original 50 protected benchmark against `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`.

## Iteration Loop

1. Diagnose a family inside the active tail, not the full 195 v1 inputs.
2. Implement one narrow general fixer.
3. Run focused targets from `Input/stage145-active-low-grade-tail/manifest.json`.
4. If focused targets improve, run the full active tail manifest.
5. If the active tail improves without false-positive applied regressions, run the original 50 protected benchmark and Stage 41 gate.
6. Refresh the active tail manifest only after a kept behavior change or after clear repeat volatility removes rows from the active set.

## Current Active Tail Shape

- Heading/reading-order debt remains the largest blocker: `17` rows have `heading_structure < 80`, and `12` have `reading_order < 80`.
- Figure/alt mixed debt is nearly as broad: `18` rows have `alt_text < 80`.
- Table debt is smaller but severe on several rows: `9` rows have `table_markup < 80`.
- Stable OCR no-anchor Fs remain: `3451`, `3459`, `3513`, and `3602`; do not invent headings for them without new visible anchor evidence.

## Recommended Next Stage

Stage 146 should target the active-tail figure/alt mixed cluster first, especially rows where `alt_text` is the main grade limiter and previous figure tools already found checker-visible targets. Keep OCR no-anchor rows parked unless new evidence appears.
