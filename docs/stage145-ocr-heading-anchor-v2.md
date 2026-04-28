# Stage 145 OCR Heading Anchor v2

Stage 145 narrows OCR page-shell heading recovery to visible, MCID-backed title evidence when OCR text order differs from filename/metadata order.

## What Changed

- OCR heading candidate selection now supports split OCR tokens across adjacent MCIDs, such as `Pre-` + `trial`.
- OCR heading candidate selection can use a high-coverage visible title window when first-page OCR contains extra cover text around the real title.
- The existing `create_heading_from_ocr_page_shell_anchor` mutator is reused; no new PDF mutation path was added.
- Added `scripts/stage145-ocr-heading-anchor-diagnostic.ts` to report OCR heading candidates, applied anchor evidence, and no-safe-anchor rows.

## Validation

- Focused unit tests pass for OCR heading, native visible-heading, and degenerate-native structure behavior.
- TypeScript static check passes.
- Target run:
  - `Output/from_sibling_pdfaf_v1_evolve_4/run-stage145-target-ocr-heading-v2-2026-04-28-r1`
  - `3490`: `10/F -> 97/A`
  - `3513` and `3602`: remain `59/F` because no safe first-page OCR title anchor is visible.
- Full affected manifest:
  - `Output/from_sibling_pdfaf_v1_evolve_4/run-stage145-evolve4-full-2026-04-28-r1`
  - Mean `28.67 -> 91.93`
  - Grades after: `22 A / 6 B / 0 C / 0 D / 2 F`
  - Compared with the Stage 144 manifest run, this removes one D and one F.
- Visual stability:
  - `Output/from_sibling_pdfaf_v1_evolve_4/stage145-visual-3490-2026-04-28-r1`
  - `3490` is pixel-stable across all 14 pages versus the Stage 144 remediated PDF.
- Original 50 protected repeat:
  - `Output/experiment-corpus-baseline/run-stage145-full-2026-04-28-r1`
  - false-positive applied remains `0`
  - Gate still fails on existing protected/runtime/heading no-effect volatility, not OCR heading behavior.

## Remaining Debt

- OCR rows `3451`, `3459`, `3602`, and `3513` still lack a safe first-page title anchor in the current remediated bytes.
- The next broad improvement target should shift to figure/alt mixed-tail recovery unless new OCR evidence exposes real visible anchors for those rows.
