# Federal Judicial Center English Materials Holdout - 2026-05-26

## Source

- Source pages:
  - https://www.fjc.gov/content/english
  - https://www.fjc.gov/content/349014/briefing-materials
  - https://www.fjc.gov/about/fjc-and-what-it-does
  - https://www.fjc.gov/content/325573/iolc-materials
- Sample: 20 official Federal Judicial Center PDFs from public English/briefing/iOLC materials.
- Size gate: every selected PDF was verified as an actual FJC-hosted PDF under the strict decimal `10,000,000` byte cap before validation.
- Selection note: selected the first 20 FJC-hosted PDF links that passed the cap after excluding stale `404` links and one external `uscourts.gov` PDF.

## Sample

| Row | PDF |
| --- | --- |
| `fjceng-01` | About FJC English 2014 |
| `fjceng-02` | U.S. Legal System: A Short Description |
| `fjceng-03` | Federal Courts and What They Do |
| `fjceng-04` | Judicial Independence |
| `fjceng-05` | Legal and Court Staff in the U.S. Judiciary |
| `fjceng-06` | Judicial Conduct and Discipline in the U.S. Federal Courts |
| `fjceng-07` | Alternative Dispute Resolution |
| `fjceng-08` | Judicial Performance Evaluation |
| `fjceng-09` | Federal Judicial Administration |
| `fjceng-10` | Who Works in a U.S. Court |
| `fjceng-11` | Judicial Conference |
| `fjceng-12` | About the FJC, October 2024 |
| `fjceng-13` | International Judicial Relations material `IJR00007` |
| `fjceng-14` | Federal Judicial Administration Chart |
| `fjceng-15` | Judicial Conference of the United States |
| `fjceng-16` | International Judicial Relations material `IJR00016` |
| `fjceng-17` | Maintaining the Public Trust CLE packet |
| `fjceng-18` | Court Web: Ethics After 5PM CLE packet |
| `fjceng-19` | Court Web: Ethical Concerns in the Age of Social Media CLE packet |
| `fjceng-20` | Every Judge Would Edit Shakespeare CLE packet |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/federal-judicial-center-english-materials-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/federal-judicial-center-english-materials-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean before: `42.50`
- Mean after: `96.10`
- Median after: `95`
- Grades after: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `2`
- Rows below `95`: `8`
- p50/p95/max: `9037ms / 14521ms / 15556ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| `fjceng-01` | `37/F` | `99/A` | `10652ms` |
| `fjceng-02` | `37/F` | `99/A` | `9824ms` |
| `fjceng-03` | `28/F` | `97/A` | `15556ms` |
| `fjceng-04` | `40/F` | `94/A` | `12358ms` |
| `fjceng-05` | `28/F` | `94/A` | `14521ms` |
| `fjceng-06` | `37/F` | `99/A` | `9994ms` |
| `fjceng-07` | `37/F` | `99/A` | `10460ms` |
| `fjceng-08` | `37/F` | `99/A` | `9794ms` |
| `fjceng-09` | `59/F` | `94/A` | `9037ms` |
| `fjceng-10` | `34/F` | `94/A` | `8235ms` |
| `fjceng-11` | `60/D` | `92/A` | `11315ms` |
| `fjceng-12` | `59/F` | `100/A` | `8150ms` |
| `fjceng-13` | `60/D` | `95/A` | `5628ms` |
| `fjceng-14` | `59/F` | `93/A` | `8916ms` |
| `fjceng-15` | `60/D` | `92/A` | `9395ms` |
| `fjceng-16` | `34/F` | `99/A` | `5818ms` |
| `fjceng-17` | `28/F` | `95/A` | `6578ms` |
| `fjceng-18` | `42/F` | `94/A` | `8799ms` |
| `fjceng-19` | `46/F` | `99/A` | `8286ms` |
| `fjceng-20` | `28/F` | `95/A` | `6382ms` |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for source mean `93`: `0`
- Timeout/error rows: `0`
- Low rows: `fjceng-11` and `fjceng-15`, both `92/A`.
- Candidate class: `near_miss_monitor`.
- Lowest-category evidence: both lows were one-point heading-structure near misses with `heading_structure=80`, `reading_order=94`, and `pdf_ua_compliance=100`.

## Decision

No source change was accepted for this holdout.

The current engine handles this Federal Judicial Center material set well: every row reached A grade, the source mean is comfortably above `93`, runtime stayed bounded, and `false_positive_applied` stayed `0`. The two sub-93 rows are low-upside near misses and do not expose a general, object-backed scoring or remediation lane.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
