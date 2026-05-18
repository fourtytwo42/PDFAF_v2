# Oregon CJC STOP Holdout - 2026-05-18

## Source

- Source page: `https://www.oregon.gov/cjc/stop/Pages/default.aspx`
- Source family: Oregon Criminal Justice Commission STOP program public reports and program documents.
- Sample: 20 official Oregon CJC PDFs, all under 10 MB.
- Local PDF input was temporary: `Input/oregon_cjc_stop_holdout_2026_05_18/`.
- Validation mode: deterministic Node 22, `--no-semantic --no-pdfs`, with local LLM disabled.
- Cleanup: downloaded PDFs, temporary focus symlinks, and generated run artifacts were deleted after metrics extraction.

## Source Set

| File | Size MB | URL |
|---|---:|---|
| `01-oregon-cjc-stop-STOP_Agency_Summaries_2021_Final.pdf` | 1.80 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Agency_Summaries_2021_Final.pdf` |
| `02-oregon-cjc-stop-STOP_REPORT_2021_FINAL.pdf` | 1.24 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_REPORT_2021_FINAL.pdf` |
| `03-oregon-cjc-stop-STOP_Report_2020_FINAL.pdf` | 3.17 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_2020_FINAL.pdf` |
| `04-oregon-cjc-stop-STOP_Report_2022.pdf` | 1.32 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_2022.pdf` |
| `05-oregon-cjc-stop-STOP_Report_2023.pdf` | 1.11 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_2023.pdf` |
| `06-oregon-cjc-stop-STOP_Report_2024.pdf` | 1.09 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_2024.pdf` |
| `07-oregon-cjc-stop-STOP_Report_2025.pdf` | 1.05 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_2025.pdf` |
| `08-oregon-cjc-stop-STOP_Report_ExecutiveSummary.pdf` | 0.29 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_ExecutiveSummary.pdf` |
| `09-oregon-cjc-stop-STOP_Report_Final.pdf` | 2.25 | `https://www.oregon.gov/cjc/CJC%20Document%20Library/STOP_Report_Final.pdf` |
| `10-oregon-cjc-stop-OregonLECCProfilingSummaryNEW.pdf` | 0.10 | `https://www.oregon.gov/cjc/stop/Documents/OregonLECCProfilingSummaryNEW.pdf` |
| `11-oregon-cjc-stop-STOPKickOffPresentation.pdf` | 0.91 | `https://www.oregon.gov/cjc/stop/Documents/STOPKickOffPresentation.pdf` |
| `12-oregon-cjc-stop-STOP_FAQ.pdf` | 0.11 | `https://www.oregon.gov/cjc/stop/Documents/STOP_FAQ.pdf` |
| `13-oregon-cjc-stop-STOP_Officer_Reference_Guide_08152023.pdf` | 0.83 | `https://www.oregon.gov/cjc/stop/Documents/STOP_Officer_Reference_Guide_08152023.pdf` |
| `14-oregon-cjc-stop-Traffic_Stop_Research_Memo_Final_Draft-10-16-18.pdf` | 0.22 | `https://www.oregon.gov/cjc/stop/Documents/Traffic_Stop_Research_Memo_Final_Draft-10-16-18.pdf` |
| `15-oregon-cjc-stop-tier_1_STOP_update_12042017.pdf` | 0.10 | `https://www.oregon.gov/cjc/stop/Documents/tier_1_STOP_update_12042017.pdf` |
| `16-oregon-cjc-stop-tier_1_agencies.pdf` | 0.11 | `https://www.oregon.gov/cjc/stop/Documents/tier_1_agencies.pdf` |
| `17-oregon-cjc-stop-tier_1_stop_overview_10132017.pdf` | 0.12 | `https://www.oregon.gov/cjc/stop/Documents/tier_1_stop_overview_10132017.pdf` |
| `18-oregon-cjc-stop-tier_2_tier3_STOP_overview_10162017.pdf` | 0.11 | `https://www.oregon.gov/cjc/stop/Documents/tier_2_tier3_STOP_overview_10162017.pdf` |
| `19-oregon-cjc-stop-tier_2_verification_12112017.pdf` | 0.11 | `https://www.oregon.gov/cjc/stop/Documents/tier_2_verification_12112017.pdf` |
| `20-oregon-cjc-stop-STOP-Solution-Information-and-Overview-Ver-10.pdf` | 0.73 | `https://www.oregon.gov/cjc/stop/SiteAssets/Pages/default/STOP%20Solution%20Information%20and%20Overview%20-%20Ver%2010.pdf` |

## Accepted-Code Baseline

Run:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/oregon_cjc_stop_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/oregon-cjc-stop-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Result:

- Processed: `20/20`
- Completed-row report mean: `45.32 -> 92.21`
- All-row mean counting timeout as zero: `87.60`
- Median after remediation: `94`
- Rows below `93`: `8`
- `false_positive_applied`: `0`
- Runtime total/p95/max: `1362340ms / 246282ms / 300061ms`
- Hard per-PDF timeout: `01-oregon-cjc-stop-STOP_Agency_Summaries_2021_Final.pdf`

This source fails the requested 93+ mean target. The median clears `93`, but the hard timeout makes the honest all-row mean much lower than the completed-row summary.

## Row Results

| File | Before | After | Duration ms | Main residual |
|---|---:|---:|---:|---|
| `01-oregon-cjc-stop-STOP_Agency_Summaries_2021_Final.pdf` | 76/C | 0/? | 300061 | hard timeout |
| `02-oregon-cjc-stop-STOP_REPORT_2021_FINAL.pdf` | 48/F | 69/D | 172575 | table `16`, alt `50`, PDF/UA `50` |
| `03-oregon-cjc-stop-STOP_Report_2020_FINAL.pdf` | 35/F | 96/A | 57776 | none |
| `04-oregon-cjc-stop-STOP_Report_2022.pdf` | 51/F | 97/A | 126070 | none |
| `05-oregon-cjc-stop-STOP_Report_2023.pdf` | 43/F | 95/A | 108901 | none |
| `06-oregon-cjc-stop-STOP_Report_2024.pdf` | 58/F | 69/D | 246282 | heading `60`, table `0`, PDF/UA `71` |
| `07-oregon-cjc-stop-STOP_Report_2025.pdf` | 59/F | 100/A | 47305 | none |
| `08-oregon-cjc-stop-STOP_Report_ExecutiveSummary.pdf` | 46/F | 98/A | 10800 | none |
| `09-oregon-cjc-stop-STOP_Report_Final.pdf` | 35/F | 94/A | 136296 | near pass |
| `10-oregon-cjc-stop-OregonLECCProfilingSummaryNEW.pdf` | 28/F | 94/A | 6708 | near pass |
| `11-oregon-cjc-stop-STOPKickOffPresentation.pdf` | 59/F | 91/A | 38077 | heading `79`, alt `85`, PDF/UA `79` |
| `12-oregon-cjc-stop-STOP_FAQ.pdf` | 59/F | 100/A | 4413 | none |
| `13-oregon-cjc-stop-STOP_Officer_Reference_Guide_08152023.pdf` | 49/F | 97/A | 25343 | none |
| `14-oregon-cjc-stop-Traffic_Stop_Research_Memo_Final_Draft-10-16-18.pdf` | 38/F | 97/A | 15733 | none |
| `15-oregon-cjc-stop-tier_1_STOP_update_12042017.pdf` | 36/F | 92/A | 11663 | heading `80` |
| `16-oregon-cjc-stop-tier_1_agencies.pdf` | 81/B | 93/A | 6554 | near pass |
| `17-oregon-cjc-stop-tier_1_stop_overview_10132017.pdf` | 36/F | 92/A | 12156 | heading `80` |
| `18-oregon-cjc-stop-tier_2_tier3_STOP_overview_10162017.pdf` | 36/F | 92/A | 11624 | heading `80` |
| `19-oregon-cjc-stop-tier_2_verification_12112017.pdf` | 36/F | 92/A | 11785 | heading `80` |
| `20-oregon-cjc-stop-STOP-Solution-Information-and-Overview-Ver-10.pdf` | 28/F | 94/A | 12218 | near pass |

## Focused Repeat

Focused repeat:

`/mnt/pdf-review/pdfaf-validation/oregon-cjc-stop-focus-2026-05-18-r1/baseline_report.json`

Rows:

- `01` repeated as a hard timeout at `300061ms`.
- `02` repeated at `69/D`.
- `06` repeated at `69/D`.
- `07` repeated as the control at `100/A`.
- `false_positive_applied`: `0`.

The low rows are repeatable, not just one-run noise.

## Findings

1. Oregon STOP is mostly covered outside the table/runtime tail.

Twelve of twenty rows finish at or above `93`, including `2020`, `2022`, `2023`, `2025`, the executive summary, FAQ, officer reference guide, and the research memo.

2. The hard timeout is the highest-impact blocker.

`STOP_Agency_Summaries_2021_Final.pdf` starts at `76/C` but returns `0/?` after the 5-minute per-PDF wall guard in both the full run and focused repeat. This alone costs enough points to keep the all-row mean far below `93`.

3. The D-grade annual reports are table/PDF-UA transaction debt.

Rows `02` and `06` repeatedly plateau at `69/D`. The final state still has severe table debt (`table_markup=16` and `0`), and existing table/structure tools are rejected or no-op. The repeated rejection reason is `pac_rule_regressed(pdfua.table.header_association_present)`, so a safe fix would need a real table/header transaction that proves final PAC improvement rather than a looser acceptance gate.

4. Near-pass guide rows are not the right first fixer.

Rows `15`, `17`, `18`, and `19` finish at `92/A` with heading `80`. They are cheap one-point candidates, but the source mean is dominated by the timeout and D-grade table rows. The stop condition should prioritize hard-timeout recovery or table transaction design first.

## Decision

No source behavior was accepted or pushed from this source set. The next useful general lane is either runtime stabilization/checkpointing for expensive high-initial-score rows, or a stricter table/header transaction design for annual reports that currently trigger `pdfua.table.header_association_present` PAC regressions. Do not add Oregon/source/year/PDF-specific logic.
