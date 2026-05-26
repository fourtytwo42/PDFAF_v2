# Kentucky Court Legal Forms Holdout - 2026-05-26

## Summary

This holdout sampled 20 public PDF legal forms from the Kentucky Court of Justice Legal Forms page:

- Source: `https://www.kycourts.gov/Legal-Forms/Pages/default.aspx`
- Selection: English base form PDFs only, excluding language variants and files at or above a strict decimal `10,000,000` byte cap.
- Validation mode: deterministic no-semantic/no-remediated-PDF bounded holdout validation.
- Decision: diagnostic-only; no source behavior change accepted.

The source is close to the 93 target but does not justify a production fix from this evidence alone. The best future lane is annotation/form tooltip parity, but the current remediation path already invokes the relevant annotation/form tools, so any promotion needs a separate object-backed behavior proof with final PAC debt checks and controls.

## Sample

| Row | File | Source Form |
| --- | --- | --- |
| `kyforms-01` | `kyforms-01.pdf` | AOC-SJ-4 Order Assigning Special Judge, Disqualification of Regular Judge |
| `kyforms-02` | `kyforms-02.pdf` | AOC-SJ-3 Order Assigning Special Judge, Unavailability of Regular Judge |
| `kyforms-03` | `kyforms-03.pdf` | AOC-SJ-21 Voucher for Services as Kentucky Supreme Court Special Justice |
| `kyforms-04` | `kyforms-04.pdf` | AOC-SJ-20 Retired Justice or Judge Voucher for Services as Special Judge |
| `kyforms-05` | `kyforms-05.pdf` | AOC-SJ-2 Order Certifying Need for Special Judge Assignment |
| `kyforms-06` | `kyforms-06.pdf` | AOC-SJ-13 Extrajudicial Activities Public Report of Reimbursement |
| `kyforms-07` | `kyforms-07.pdf` | AOC-SJ-12 Application for the Retired Judges Program |
| `kyforms-08` | `kyforms-08.pdf` | AOC-SJ-11 Request for Assignment of Special Judge by Chief Justice |
| `kyforms-09` | `kyforms-09.pdf` | AOC-SJ-10 Retired Judge Monthly Reporting Form |
| `kyforms-10` | `kyforms-10.pdf` | AOC-SJ-1 Order Certifying Need for Special Judge Assignment |
| `kyforms-11` | `kyforms-11.pdf` | AOC-RU-009 Expungement Certification Request |
| `kyforms-12` | `kyforms-12.pdf` | AOC-RU-006 Emergency Services Request |
| `kyforms-13` | `kyforms-13.pdf` | AOC-RU-005 Licensing Agency Request |
| `kyforms-14` | `kyforms-14.pdf` | AOC-RU-004 Records Check Request |
| `kyforms-15` | `kyforms-15.pdf` | AOC-MED-ADR-9 Mediation Agreement |
| `kyforms-16` | `kyforms-16.pdf` | AOC-MED-ADR-8 Agreement to Mediate |
| `kyforms-17` | `kyforms-17.pdf` | AOC-MED-ADR-15.1 Family Mediation Confidential Report to AOC |
| `kyforms-18` | `kyforms-18.pdf` | AOC-MED-ADR-15 Felony Mediation Confidential Report to AOC |
| `kyforms-19` | `kyforms-19.pdf` | AOC-MED-ADR-14 Request for Assignment of Retired Judge |
| `kyforms-20` | `kyforms-20.pdf` | AOC-MED-ADR-13 Agreement to Mediate for Criminal Cases |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/kentucky-court-legal-forms-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/kentucky-court-legal-forms-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean | 92.70 |
| Median | 93 |
| Grades | 17 A / 3 B / 0 C / 0 D / 0 F |
| Rows below 93 | 8 |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 12.623s / 16.135s / 20.452s |
| Raw points needed for mean 93 | 6 |

Rows below 93:

| Row | Score | Lowest Residual Categories |
| --- | ---: | --- |
| `kyforms-14.pdf` | 86/B | `alt_text=45`, `form_accessibility=78`, `pdf_ua_compliance=79`, `reading_order=94` |
| `kyforms-08.pdf` | 89/B | `reading_order=55`, `form_accessibility=89`, `pdf_ua_compliance=79` |
| `kyforms-10.pdf` | 89/B | `reading_order=55`, `form_accessibility=86`, `pdf_ua_compliance=79` |
| `kyforms-01.pdf` | 90/A | `reading_order=62`, `form_accessibility=83`, `pdf_ua_compliance=79` |
| `kyforms-12.pdf` | 90/A | `reading_order=60`, `form_accessibility=89`, `pdf_ua_compliance=79` |
| `kyforms-16.pdf` | 90/A | `form_accessibility=59`, `heading_structure=80`, `pdf_ua_compliance=79` |
| `kyforms-13.pdf` | 92/A | `reading_order=64`, `form_accessibility=89`, `pdf_ua_compliance=79` |
| `kyforms-17.pdf` | 92/A | `form_accessibility=74`, `heading_structure=80`, `pdf_ua_compliance=79` |

## Focused Repeat

The eight rows below 93 were repeated sequentially with the same deterministic bounded validation mode.

| Row | Primary | Repeat |
| --- | ---: | ---: |
| `kyforms-01.pdf` | 90/A | 90/A |
| `kyforms-08.pdf` | 89/B | 96/A |
| `kyforms-10.pdf` | 89/B | 97/A |
| `kyforms-12.pdf` | 90/A | 91/A |
| `kyforms-13.pdf` | 92/A | 95/A |
| `kyforms-14.pdf` | 86/B | 86/B |
| `kyforms-16.pdf` | 90/A | 90/A |
| `kyforms-17.pdf` | 92/A | 92/A |

Repeat subset result:

| Metric | Value |
| --- | ---: |
| Processed | 8/8 |
| Mean | 92.125 |
| Median | 91.5 |
| Grades | 7 A / 1 B / 0 C / 0 D / 0 F |
| Rows below 93 | 5 |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 12.052s / 17.663s / 17.663s |

The repeat shows some route/analyzer volatility in the reading-order near misses, but the main `kyforms-14` figure/alt residual and the form/heading residual rows stayed below target.

## Diagnostics

Primary low-row diagnostic:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed: `6`
- Lane split:
  - `reading_link_order_candidate`: `kyforms-08`, `kyforms-10`, `kyforms-12`
  - `figure_alt_object_candidate`: `kyforms-14`
  - `near_miss_monitor`: `kyforms-01`, `kyforms-13`, `kyforms-17`
  - `no_safe_predicate`: `kyforms-16`

Repeat low-row diagnostic:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `figure_alt_object_candidate`
- Raw points needed on the repeated subset: `7`
- `kyforms-14` remained the main candidate but stayed blocked by PAC-like figure-alt regression evidence.

Reading-order shell diagnostic:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Figure/alt no-gain diagnostic:

- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `1`
- Scoring candidates: `0`
- Behavior candidates: `0`
- `kyforms-14` classified as `figure_pac_regression_blocker`

Annotation/form parity diagnostic:

- Decision: `plan_annotation_form_behavior_stage`
- All 10 sampled rows were classified as `form_tooltip_repair_candidate`.
- This is planning evidence only. The diagnostic analyzed initial PDFs, while the baseline remediation already attempted `fill_form_field_tooltips` and related annotation/form tools. Remaining form debt needs a separate final-PDF transaction proof before behavior promotion.

## Decision

No production behavior was accepted from this holdout.

The Kentucky legal forms set is close to the target and fast, but the available evidence does not justify broadening remediation:

- Reading-order candidates were not supported by the native reading shell diagnostic.
- The strongest figure/alt residual is blocked by PAC-style regression evidence.
- Annotation/form evidence is promising but not acceptance-ready because existing form tools already ran and final residual debt needs object-backed proof with controls.
- The source is only six raw points below mean 93, so accepting a risky repair for this set would not meet the current generalization standard.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts remain local only and were cleaned after metrics extraction.
