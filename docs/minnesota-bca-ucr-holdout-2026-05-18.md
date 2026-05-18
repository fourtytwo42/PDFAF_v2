# Minnesota BCA UCR Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This outside-corpus check uses public Uniform Crime Report PDFs from the Minnesota Legislative Reference Library archive for Minnesota Bureau of Criminal Apprehension reports.

Source page: https://www.lrl.mn.gov/edocs/edocs?oclcnumber=20080426

Local input set:

`Input/minnesota_bca_ucr_holdout_2026_05_18/`

The folder contained 20 public annual Uniform Crime Report PDFs. Every selected PDF was below 10 MB; the full sample was about 93.5 MB, with a largest file of about 8.3 MB. The 2009 annual report was skipped because it exceeded the 10 MB cap.

PDFs and generated artifacts are temporary local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 5400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/minnesota_bca_ucr_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/minnesota-bca-ucr-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Artifact:

`/mnt/pdf-review/pdfaf-validation/minnesota-bca-ucr-holdout-2026-05-18-r1/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Completed-row report mean: 40.13 -> 72.19
- All-row mean including timeout zeros: 40.13 -> 57.75
- All-row median: 33 -> 59
- Rows below 93: 15
- Rows below 95: 18
- Errors: 4 hard per-PDF timeouts
- `false_positive_applied`: 0
- Total deterministic runtime: 3,530,344 ms
- p95 runtime: 300,032 ms
- Max runtime: 300,079 ms

This source set does not meet the requested 93+ mean/median threshold. The completed-row report mean excludes hard timeout rows, so the stricter timeout-inclusive all-row mean is the honest source result for progress accounting.

## Row Results

| File | Before | After | Duration ms | Error |
|---|---:|---:|---:|---|
| `01-mn-bca-ucr-2024.pdf` | 79/C | 91/A | 65,708 |  |
| `02-mn-bca-ucr-2023.pdf` | 69/D | 94/A | 30,706 |  |
| `03-mn-bca-ucr-2022.pdf` | 48/F | 97/A | 59,744 |  |
| `04-mn-bca-ucr-2021.pdf` | 45/F | 91/A | 178,208 |  |
| `05-mn-bca-ucr-2020.pdf` | 37/F | 59/F | 27,145 |  |
| `06-mn-bca-ucr-2019.pdf` | 37/F | 93/A | 46,312 |  |
| `07-mn-bca-ucr-2018.pdf` | 28/F | 97/A | 27,748 |  |
| `08-mn-bca-ucr-2017.pdf` | 36/F | 59/F | 45,589 |  |
| `09-mn-bca-ucr-2016.pdf` | 35/F | 93/A | 49,386 |  |
| `10-mn-bca-ucr-2015.pdf` | 30/F | 0/? | 300,032 | `per_pdf_timeout_300000ms` |
| `11-mn-bca-ucr-2014.pdf` | 28/F | 0/? | 300,019 | `per_pdf_timeout_300000ms` |
| `12-mn-bca-ucr-2013.pdf` | 28/F | 0/? | 300,032 | `per_pdf_timeout_300000ms` |
| `13-mn-bca-ucr-2012.pdf` | 32/F | 65/D | 265,546 |  |
| `14-mn-bca-ucr-2011.pdf` | 25/F | 0/? | 300,010 | `per_pdf_timeout_300000ms` |
| `15-mn-bca-ucr-2010.pdf` | 31/F | 59/F | 233,526 |  |
| `16-mn-bca-ucr-2008.pdf` | 29/F | 59/F | 177,472 |  |
| `17-mn-bca-ucr-2007.pdf` | 32/F | 59/F | 276,810 |  |
| `18-mn-bca-ucr-2006.pdf` | 42/F | 59/F | 253,653 |  |
| `19-mn-bca-ucr-2005.pdf` | 34/F | 34/F | 300,079 |  |
| `20-mn-bca-ucr-2004.pdf` | 28/F | 46/F | 292,619 |  |

## Findings

1. Recent reports are partially covered, but not fully.

Rows `02`, `03`, `06`, `07`, and `09` finish at or above `93`. Rows `01` and `04` reach `91/A`, so the current/recent report shape is close but not consistently above the holdout target.

2. Historical annual reports are a major runtime/analyzer stress case.

The run emitted repeated Python analysis timeout messages before completing. Four rows hard-timed out at the per-PDF wall: `2015`, `2014`, `2013`, and `2011`. Several other historical rows completed near the wall or stayed low: `2012` at `65/D`, `2010` at `59/F`, `2008` at `59/F`, `2007` at `59/F`, `2006` at `59/F`, `2005` at `34/F`, and `2004` at `46/F`.

3. The residual is not a narrow source-specific fixer.

The low rows show a mix of:

- analyzer/runtime timeouts on large historical reports,
- zero-heading or low-reading states,
- table/PDF-UA residuals,
- figure-alt PAC regressions,
- annotation/PDF-UA PAC regressions that block broad structure mutations.

Those failure shapes overlap with known parked debt, but they are too broad for a safe one-off change. A source/year/PDF-specific rule would violate the goal. A real fix would need a general runtime/analyzer strategy for historical annual reports and a separate structural repair design that preserves PAC invariants.

## Decision

No behavior change was made or accepted from this source set.

The next useful lane from this evidence is not a broad table/heading heuristic. It is a general runtime/analyzer project for timeout-heavy historical annual reports, followed by focused structural repair work only where the predicate is based on document evidence and can pass original-50 quality and speed validation.

Generated public PDFs and public-source benchmark artifacts are removed after extracting the source-tracked metrics above.
