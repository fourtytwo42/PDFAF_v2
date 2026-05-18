# Arizona ACJC SAC Holdout - 2026-05-18

## Source

- Source page: `https://www.azcjc.gov/Programs/Publications/Statistical-Analysis-Center`
- Sample: first 20 linked PDF publications from the ACJC Statistical Analysis Center listing, all under 10 MB.
- Local PDF input was temporary: `Input/arizona_acjc_sac_holdout_2026_05_18/`.
- Validation mode: deterministic Node 22, `--no-semantic --no-pdfs`, with local LLM disabled.
- Cleanup: downloaded PDFs, temporary symlink inputs, and generated run artifacts were deleted after metrics extraction.

## Accepted-Code Baseline

Run:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= timeout 3600s \
  npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/arizona_acjc_sac_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/arizona-acjc-sac-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Result:

- Processed: `20/20`
- Mean: `54.20 -> 93.60`
- Median after remediation: `92.5`
- Rows below `93`: `10`
- `false_positive_applied`: `0`
- Runtime total/p95/max: `723445ms / 67300ms / 71307ms`

This source was close but did not meet the public-source goal because the median remained below `93`.

## Diagnostic Candidate

A temporary OCR page-shell heading top-up was tested and then reverted. The candidate allowed a clean, single-page OCR shell with no real headings and high text/PDF-UA/reading-order scores to create an H1 from a visible MCID-backed title span. It also allowed year-bearing title-prefix tokens near the start of the visible title.

Focused fact-sheet repeat:

- Run: `/mnt/pdf-review/pdfaf-validation/arizona-acjc-focus-factsheets-ocr-topup-2026-05-18-r2/baseline_report.json`
- Rows `06`, `18`, `19`, and `20` all reached `99/A`
- `false_positive_applied`: `0`

Full Arizona candidate:

- Run: `/mnt/pdf-review/pdfaf-validation/arizona-acjc-sac-ocr-topup-2026-05-18-r1/baseline_report.json`
- Processed: `20/20`
- Mean: `54.20 -> 95.00`
- Median after remediation: `96`
- Rows below `93`: `7`
- `false_positive_applied`: `0`
- Runtime total/p95/max: `746900ms / 70403ms / 70835ms`

The candidate lifted the source above the 93+ mean/median target, but it was not accepted because the required original-50 gate was not clean.

## Original-50 Gate

Because `baseline-corpus-batch.ts` only reads top-level PDFs, the nested original corpus was exposed through a temporary flat symlink view at `/tmp/pdfaf-original50-flat`.

Run:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= timeout 5400s \
  npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  /tmp/pdfaf-original50-flat \
  /mnt/pdf-review/pdfaf-validation/original50-ocr-topup-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Result:

- All-row mean including timeout zeros: `91.14`
- Completed-row mean from run summary: `94.9375`
- Median after remediation: `96`
- `false_positive_applied`: `0`
- Hard timeouts: `structure-4438`, `long-4516`
- Runtime total/p95/max: `2455353ms / 298219ms / 300019ms`

Comparison baseline:

- Prior accepted Stage 180 original-50 candidate: `/mnt/pdf-review/pdfaf-validation/original50-stage180-candidate-2026-05-18-r1/baseline_report.json`
- All-row mean including timeout zeros: `91.92`
- Completed-row mean from run summary: `93.7959`
- Median after remediation: `94.5`
- Hard timeout: `structure-4438`
- Runtime total/p95/max: `2384455ms / 248304ms / 300021ms`

The candidate original-50 run introduced an additional hard timeout on `long-4516` and raised p95 runtime materially. A focused repeat on the main regression rows confirmed the runtime issue repeated:

- Run: `/mnt/pdf-review/pdfaf-validation/original50-regression-focus-ocr-topup-2026-05-18-r1/baseline_report.json`
- `long-4516`: `58/F -> 0/?`, `per_pdf_timeout_300000ms`
- `long-4683`: `48/F -> 69/D`, confirming route/analyzer volatility

## Decision

No source behavior was accepted or pushed from this Arizona set. The OCR top-up candidate is useful diagnostic evidence for clean one-page OCR fact sheets, but it remains blocked by original-50 runtime regression evidence. Do not reintroduce the candidate unless a follow-up design also clears original-50 quality and speed gates.

Next useful work is a general runtime/analyzer stabilization lane around `long-4516` / `long-4683`, or a narrower OCR page-shell title top-up retest after that runtime debt is controlled.
