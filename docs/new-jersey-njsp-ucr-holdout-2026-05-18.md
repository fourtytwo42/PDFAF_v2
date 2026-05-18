# New Jersey NJSP UCR Holdout - 2026-05-18

## Source

- Source family: New Jersey State Police Uniform Crime Reporting public reports.
- Sample: 20 official NJSP public PDFs, all under 10 MB.
- Local PDF input was temporary: `Input/new_jersey_njsp_ucr_holdout_2026_05_18/`.
- Validation mode: deterministic Node 22, `--no-semantic --no-pdfs`, with local LLM disabled.
- Cleanup: downloaded PDFs and generated run artifacts were deleted after metrics extraction.

## Source Set

| File | Size MB | URL |
|---|---:|---|
| `njsp-ucr-annual-2004.pdf` | 4.24 | `https://www.nj.gov/njsp/info/ucr2004/pdf/2004_ucr_whole.pdf` |
| `njsp-ucr-annual-2005.pdf` | 4.41 | `https://www.nj.gov/njsp/info/ucr2005/pdf/2005-ucr.pdf` |
| `njsp-ucr-annual-2006.pdf` | 3.52 | `https://www.nj.gov/njsp/info/ucr2006/pdf/2006-Uniform-Crime-Report.pdf` |
| `njsp-ucr-annual-2007.pdf` | 3.11 | `https://www.nj.gov/njsp/info/ucr2007/pdf/2007-uniform-crime-report.pdf` |
| `njsp-ucr-annual-2008.pdf` | 6.94 | `https://www.nj.gov/njsp/info/ucr2008/pdf/2008-uniform-crime-report.pdf` |
| `njsp-ucr-annual-2009.pdf` | 2.21 | `https://www.nj.gov/njsp/info/ucr2009/pdf/2009_uniform_crime_report_b.pdf` |
| `njsp-ucr-annual-2010.pdf` | 6.64 | `https://www.nj.gov/njsp/info/ucr2010/pdf/2010_ucr_091712.pdf` |
| `njsp-ucr-annual-2011.pdf` | 5.43 | `https://www.nj.gov/njsp/info/ucr2011/pdf/2011_uniform_crime_report.pdf` |
| `njsp-ucr-annual-2012.pdf` | 4.21 | `https://www.nj.gov/njsp/info/ucr2012/pdf/2012_uniform_crime_rpt.pdf` |
| `njsp-ucr-annual-2013.pdf` | 2.88 | `https://www.nj.gov/njsp/info/ucr2013/pdf/2013_ucrfull.pdf` |
| `njsp-ucr-annual-2014.pdf` | 2.25 | `https://www.nj.gov/njsp/ucr/2014/pdf/2014_uniform_crime_report.pdf` |
| `njsp-ucr-annual-2015.pdf` | 3.06 | `https://www.nj.gov/njsp/ucr/2015/pdf/2015b_uniform_crime_report.pdf` |
| `njsp-ucr-annual-2016.pdf` | 7.39 | `https://www.nj.gov/njsp/ucr/2016/pdf/2016a_uniform_crime_report.pdf` |
| `njsp-ucr-annual-2017.pdf` | 1.35 | `https://www.nj.gov/njsp/ucr/pdf/current/20180504_crimetrend_2017.pdf` |
| `njsp-ucr-domestic-violence-2018.pdf` | 4.40 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2018_Domestic_Violence_Report_v2.pdf` |
| `njsp-ucr-domestic-violence-2019.pdf` | 1.29 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2019_NJ_Domestic_Violence.pdf` |
| `njsp-ucr-domestic-violence-2020.pdf` | 1.34 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2020_Domestic_Violence_Report.pdf` |
| `njsp-ucr-domestic-violence-2021.pdf` | 1.43 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2021_Domestic_Violence_Report.pdf` |
| `njsp-ucr-domestic-violence-2022.pdf` | 1.41 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2022_Domestic_Violence_Report.pdf` |
| `njsp-ucr-domestic-violence-2023.pdf` | 1.41 | `https://www.nj.gov/njsp/ucr/pdf/domesticviolence/2023_Domestic_Violence_Report.pdf` |

## Accepted-Code Baseline

Run:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/new_jersey_njsp_ucr_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/new-jersey-njsp-ucr-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Result:

- Processed: `20/20`
- Mean: `37.50 -> 85.70`
- Median after remediation: `95.5`
- Rows below `93`: `7`
- `false_positive_applied`: `0`
- Runtime total/p95/max: `1017403ms / 221261ms / 223582ms`
- Hard row errors: `0`

The accepted engine clears the median target on this New Jersey sample but misses the 93+ mean target. The miss is concentrated in older annual UCR reports; the six domestic-violence reports all finish at `97/A` or `99/A`.

## Row Results

| File | Before | After | Duration ms | Main residual |
|---|---:|---:|---:|---|
| `njsp-ucr-annual-2004.pdf` | 34/F | 94/A | 221261 | PDF/UA `71`, reading `88` |
| `njsp-ucr-annual-2005.pdf` | 34/F | 94/A | 223582 | PDF/UA `71`, reading `88` |
| `njsp-ucr-annual-2006.pdf` | 38/F | 59/F | 51856 | heading `0`, reading `80` |
| `njsp-ucr-annual-2007.pdf` | 34/F | 94/A | 32468 | reading `88` |
| `njsp-ucr-annual-2008.pdf` | 38/F | 59/F | 38715 | heading `0`, reading `80` |
| `njsp-ucr-annual-2009.pdf` | 34/F | 97/A | 33775 | none |
| `njsp-ucr-annual-2010.pdf` | 38/F | 59/F | 48029 | heading `0` |
| `njsp-ucr-annual-2011.pdf` | 34/F | 97/A | 35013 | none |
| `njsp-ucr-annual-2012.pdf` | 34/F | 97/A | 27573 | none |
| `njsp-ucr-annual-2013.pdf` | 34/F | 97/A | 29662 | none |
| `njsp-ucr-annual-2014.pdf` | 48/F | 59/F | 33318 | heading `0`, reading `79` |
| `njsp-ucr-annual-2015.pdf` | 38/F | 92/A | 54355 | PDF/UA `79`, reading `80` |
| `njsp-ucr-annual-2016.pdf` | 31/F | 59/F | 71994 | heading `0`, table `79`, reading `80` |
| `njsp-ucr-annual-2017.pdf` | 33/F | 69/D | 35490 | reading `35` |
| `njsp-ucr-domestic-violence-2018.pdf` | 36/F | 97/A | 13796 | none |
| `njsp-ucr-domestic-violence-2019.pdf` | 36/F | 97/A | 14284 | none |
| `njsp-ucr-domestic-violence-2020.pdf` | 36/F | 97/A | 16824 | none |
| `njsp-ucr-domestic-violence-2021.pdf` | 49/F | 99/A | 10651 | none |
| `njsp-ucr-domestic-violence-2022.pdf` | 49/F | 99/A | 10663 | none |
| `njsp-ucr-domestic-violence-2023.pdf` | 42/F | 99/A | 14094 | none |

## Findings

1. The failure is not broad source failure.

Thirteen of twenty rows finish at or above `93`, and all six domestic-violence rows finish at `97+`. The low mean comes from a repeatable older annual-report shape.

2. The main residual shape is a deep native-tagged zero-heading shell.

Rows `2006`, `2008`, `2010`, `2014`, and `2016` remain at `59/F` with heading structure `0`. Diagnostics showed they already have native structure and marked-content evidence, but the existing safe bootstrap path is tuned for untagged or shallower degenerate shells. Current structural proposals tend to be blocked by PAC orphan-MCID or annotation concerns before they can become a final accepted sequence.

3. The `2017` row is a separate reading-order shell.

It reaches heading `94`, but reading order remains `35`. The existing degenerate native reading-order repair reports the document has too many direct children, so this is not the same fix as the zero-heading rows.

4. Runtime is bounded but top-heavy.

There are no hard per-PDF timeouts, but the 2004 and 2005 annual reports each run about 3.7 minutes and dominate p95/max runtime.

## Diagnostic Candidate Status

A temporary orphan-only proposal-buffer sequence experiment was tested and reverted. The target low-row repeat produced the same final scores as the baseline for the seven low annual rows, because the useful structural proposals were already recorded as rejected before the existing proposal-buffer sequence path could materialize them.

Manual probes also showed that forcing native text-block tagging before a second full remediation pass can lift several zero-heading rows into the low 90s, but that is not an accepted engine fix: it bypasses current PAC/stage acceptance, does not solve every low row, and needs a real general transaction design with original-50 speed and quality validation.

## Decision

No source behavior was accepted or pushed from this New Jersey set. The useful next lane is a general transaction design for deep native-tagged marked-content shells with zero reachable headings, preserving PAC truth and avoiding source/year/PDF-specific gates.
