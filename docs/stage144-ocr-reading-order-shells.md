# Stage 144 OCR Reading-Order Shells

Stage 144 targets engine-owned OCR page-shell PDFs whose OCR text is extractable and tagged but whose exported structure remains too shallow for reliable reading-order scoring.

## What Changed

- `ensure_accessibility_tagging` now records the existing engine-owned OCR text-tagging provenance marker when it tags OCRmyPDF output.
- Added guarded `synthesize_ocr_page_shell_reading_order_structure`, which deepens existing OCR page-shell paragraph structure under page sections without changing page content streams.
- The new reading-order structure pass runs only after a safe OCR heading exists, on engine-owned OCR output with real text/MCID evidence, and is accepted only if reading order and total score improve.
- Added `scripts/stage144-low-grade-tail-diagnostic.ts` to classify current C/D/F rows and inspect OCR shell evidence.

## Validation

- Focused OCR unit tests pass.
- Static TypeScript and Python syntax checks pass.
- Holdout 3 full run:
  - `Output/from_sibling_pdfaf_v1_holdout_3/run-stage144-holdout3-2026-04-28-r1`
  - Grades after: `25 A / 5 B / 0 C / 0 D / 0 F`
  - OCR shell controls `3423`, `3429`, `3433`: `97/A`
- Visual stability for the new reading-order structure step:
  - `Output/from_sibling_pdfaf_v1_holdout_3/stage144-visual-3423-r1-vs-r2-2026-04-28-r1`
  - Result: pixel-stable on all 12 pages versus the same OCR output before the structure-deepening pass.
- No-anchor OCR rows such as `3451`, `3490`, `3602`, and `3513` improve reading order but remain capped at `59/F` because no safe heading anchor exists.
- Original 50 run:
  - `Output/experiment-corpus-baseline/run-stage144-full-2026-04-28-r1`
  - Reanalyzed grades: `34 A / 9 B / 5 C / 1 D / 1 F`
  - false-positive applied: `0`
  - Stage 41 gate: `Output/experiment-corpus-baseline/stage144-benchmark-gate-2026-04-28-r1`

## Remaining Debt

The Stage 41 gate still fails on protected reanalysis volatility in non-OCR rows. The Stage 144 OCR tools do not run on those rows, and focused repeats show the same protected/analyzer volatility pattern already present before this stage.
