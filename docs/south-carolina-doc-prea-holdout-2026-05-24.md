# South Carolina DOC PREA Reports Public Holdout

Date: 2026-05-24

Source: https://www.doc.sc.gov/preaweb

This is a public-source outside-corpus diagnostic run. It used 20 public South Carolina Department of Corrections PREA PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: SCDC sexual-abuse survey PDFs for `2024` through `2006`, excluding the over-cap `2017` survey, plus the `2024` and `2023` PREA annual reports.
- Excluded by the under-10MB rule: `2017 SCDC Sexual Abuse Survey`.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `23.40 -> 91.00`.
- Median after remediation: `92.5`.
- Grades after remediation: `19 A / 0 B / 0 C / 0 D / 1 F`.
- Points needed for mean 93: `40`.
- Runtime p50/p95/max: `36296ms / 63655ms / 74769ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `reading_link_order_candidate`, driven almost entirely by one stable low row.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Reading/link-order candidate | `1` | `42` | `scprea-11-2013-sexual-abuse-survey.pdf` at `51/F`. |
| Near-miss monitor | `9` | `10` | Mostly `92/A` survey rows with reading-order/PDF-UA or text-extractability near misses. |

## Focus Repeat

A focused repeat on the low row plus nearby controls reproduced the source shape:

| File | Repeat score | Notes |
| --- | ---: | --- |
| `scprea-10-2014-sexual-abuse-survey.pdf` | `91/A` | Similar shallow/reading-order debt but not catastrophic. |
| `scprea-11-2013-sexual-abuse-survey.pdf` | `51/F` | Stable failure. |
| `scprea-12-2012-sexual-abuse-survey.pdf` | `93/A` | Control remained stable. |
| `scprea-13-2011-sexual-abuse-survey.pdf` | `93/A` | Control remained stable. |

Direct source analysis of the 2013 failure showed a tagged, shallow structure tree with no extracted text and no layout heading evidence. Nearby 2012/2011 controls used the existing native text-block fallback synthesis path successfully, while the 2013 row did not expose the same safe object-backed target.

## Decision

No source behavior change is accepted from this source. The source misses the 93 mean target, but the only high-impact row points to native/OCR text-recovery plus shallow tagged-structure debt without a safe general predicate. A behavior change here would risk broad OCR/native-shell admission from a single row.

This holdout reinforces two parked general lanes:

- native tagged shallow-shell recovery when pdf.js extracts no text;
- low-risk reading-order/text-extractability cleanup for near-pass report rows.

Any future fix needs additional positives, controls, and original-50 quality/speed validation before acceptance. Because no source behavior changed, no original-50 regression validation was required for this source.
