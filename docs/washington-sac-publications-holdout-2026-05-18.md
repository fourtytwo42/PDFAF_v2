# Washington SAC Publications Holdout

Date: 2026-05-18

Source: Washington State Statistical Analysis Center publications page, `https://sac.ofm.wa.gov/publications`.

Decision: failed the public-source target on accepted code. No remediation behavior change was made.

## Sample

Twenty public PDFs under 10 MB were sampled from the first direct PDFs on the SAC publications page:

| Row | PDF |
| --- | --- |
| 01 | `SSODA_Handout_FINAL.pdf` |
| 02 | `PSPRC_reranking-supplemental-report.pdf` |
| 03 | `sentencing_guidelines_and_offender_score.pdf` |
| 04 | `WSP_Court_FINAL.pdf` |
| 05 | `WSP_Arrests_FIN_0.pdf` |
| 06 | `JBRS_Vehicle_Theft.pdf` |
| 07 | `vehicle_theft.pdf` |
| 08 | `robbery_jail_bookings_in_WA.pdf` |
| 09 | `robbery_arrests.pdf` |
| 10 | `rape_jail_bookings_in_WA.pdf` |
| 11 | `rape_arrests_in_WA.pdf` |
| 12 | `JBRS_Firearms.pdf` |
| 13 | `WSP_firearm_arrests.pdf` |
| 14 | `crimes_against_all.pdf` |
| 15 | `crimes_against_society.pdf` |
| 16 | `crimes_against_property.pdf` |
| 17 | `crimes_against_persons.pdf` |
| 18 | `domestic_violence_jail_booking.pdf` |
| 19 | `domestic_violence_arrests_in_washington_1.pdf` |
| 20 | `long_term_booking_trends.pdf` |

All downloaded files were between `0.25 MB` and `2.66 MB`, except the first handout at `0.37 MB`.

## Run

Temporary input:

```text
Input/washington_sac_publications_holdout_2026_05_18
```

Temporary output:

```text
/mnt/pdf-review/pdfaf-validation/washington-sac-publications-holdout-2026-05-18-r1
```

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 2400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/washington_sac_publications_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/washington-sac-publications-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

The batch completed under the outer cap but emitted one bridge warning before the final report:

```text
[bridge] python script produced no output (exit null)
```

Row 20 then recorded as the hard per-PDF timeout.

## Results

- processed: `20/20`
- mean: `76.25 -> 83.50`
- completed-row mean after remediation: `87.89`
- median: `76 -> 92`
- rows below `93`: `15`
- rows below `95`: `17`
- hard errors: `1`
- `false_positive_applied=0`
- p95/max runtime: `296108ms / 300015ms`

Rows:

| Row | Before | After | Runtime | Error |
| --- | ---: | ---: | ---: | --- |
| 01 | 69/D | 92/A | 14.3s |  |
| 02 | 86/B | 96/A | 25.9s |  |
| 03 | 69/D | 69/D | 248.7s |  |
| 04 | 87/B | 95/A | 95.1s |  |
| 05 | 86/B | 94/A | 79.2s |  |
| 06 | 79/C | 92/A | 13.5s |  |
| 07 | 76/C | 92/A | 14.5s |  |
| 08 | 79/C | 92/A | 14.1s |  |
| 09 | 76/C | 92/A | 18.5s |  |
| 10 | 76/C | 92/A | 16.0s |  |
| 11 | 76/C | 92/A | 15.3s |  |
| 12 | 76/C | 92/A | 16.7s |  |
| 13 | 76/C | 92/A | 14.2s |  |
| 14 | 83/B | 94/A | 39.1s |  |
| 15 | 69/D | 69/D | 188.0s |  |
| 16 | 69/D | 69/D | 296.1s |  |
| 17 | 69/D | 69/D | 275.9s |  |
| 18 | 79/C | 92/A | 15.0s |  |
| 19 | 76/C | 95/A | 10.7s |  |
| 20 | 69/D | 0/? | 300.0s | `per_pdf_timeout_300000ms` |

## Failure Shape

This source has two related residual classes.

The short two-page SAC briefs mostly plateau at `92/A`:

- final category shape is usually `text_extractability=96`, `heading_structure=79`, `pdf_ua_compliance=79`, and `table_markup=79`
- link and figure/alt fixes often lift the row, but remaining heading/table tools are no-effect or rejected
- some rows show `set_table_header_cells` or figure-alt tools rejected by `pdfua.table.header_association_present`

The long tabular reports are the dominant score/runtime blocker:

- rows `03`, `15`, `16`, and `17` finish at `69/D`
- row `20` hard-times out at the five-minute per-PDF wall
- final low rows retain `table_markup=0` or severe table/PDF-UA debt
- `normalize_heading_hierarchy`, `normalize_table_structure`, and `repair_native_table_headers` repeatedly reject on `pdfua.table.header_association_present`
- `set_table_header_cells` is repeatedly `no_effect`
- several long rows also spend `188s-300s`, so any fix must improve speed or at least avoid worsening the runtime tail

This is the same broad table/header transaction debt seen in California CJSC, Oregon CJC STOP, Michigan MSP CPL, and the rejected public Stage 180 low-heading experiment. The Washington evidence is stronger because it combines repeated `69/D` table rows with a hard timeout in a single public-source set.

## Decision

No source change was made from this run. The unsafe shortcut would be to widen Stage 180 admission or relax PAC rejection, but the evidence says the missing piece is a real general transaction that reduces final `pdfua.table.header_association_present` debt.

Before this source can be pushed above `93` honestly, the next candidate needs to:

- combine table normalization and header repair in one accepted final state
- prove `pdfua.table.header_association_present` decreases, not just table score movement
- preserve page/text/tag evidence and `false_positive_applied=0`
- control runtime on long table-heavy reports
- pass a targeted Washington repeat plus original-50 quality and speed validation

## Cleanup

The downloaded public PDFs and generated benchmark artifact were deleted after metrics extraction. This document is the durable source-tracked record.

