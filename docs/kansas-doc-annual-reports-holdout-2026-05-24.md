# Kansas DOC Annual Reports Public Holdout

Date: 2026-05-24

Source: https://www.doc.ks.gov/publications/Reports/Archived

This is a public-source outside-corpus diagnostic run. It used 20 public Kansas Department of Corrections annual or briefing report PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: KDOC annual reports and corrections briefing reports from FY2024 through 2003.
- Excluded by the under-10MB rule: `2008 Annual Report` and `2007 Corrections Briefing Report`.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `37.85 -> 94.35`.
- Median after remediation: `97`.
- Grades after remediation: `18 A / 0 B / 2 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `26769ms / 59369ms / 66537ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` and recommended only a diagnostic `reading_link_order_candidate` lane for the two sub-93 rows.

| File | Score | Lowest categories | Notes |
| --- | ---: | --- | --- |
| `ksdoc-09-fy2016-kdoc-annual-report.pdf` | `79/C` | `reading_order=55`, `form_accessibility=56`, `pdf_ua_compliance=71`, `link_quality=73` | Reading/link/page-furniture tools were attempted, but the source target was already met. |
| `ksdoc-16-2009-annual-report.pdf` | `79/C` | `reading_order=60`, `link_quality=73`, `pdf_ua_compliance=79`, `bookmarks=92` | Same general reading/link-order residual shape; not enough evidence for behavior promotion. |

## Download Note

The first download attempt appeared stalled because a replacement PDF exceeded the 10MB cap. `curl` exited with code `63` for that file. The sample was corrected by excluding the over-cap `2007 Corrections Briefing Report` and using the smaller 2003 briefing report instead.

## Decision

No source behavior change is accepted from this source. The accepted engine already clears the 93+ mean/median target with bounded runtime and no false-positive applications.

The two residual rows reinforce a possible future native reading/link-order diagnostic lane, but this source alone does not justify planner, scorer, mutator, PAC-gate, or timeout behavior changes. Because no source behavior changed, no original-50 regression validation was required for this source.
