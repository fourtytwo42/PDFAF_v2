# New Jersey OAG Annual Reports Holdout - 2026-05-26

## Source

- Primary source page: https://www.nj.gov/oag/library_annualreports.html
- Secondary source page: https://www.nj.gov/oag/insurancefraud/annualreports.html
- Sample: 20 official New Jersey Office of the Attorney General / Law and Public Safety annual-report PDFs under a strict decimal `10,000,000` byte cap.
- Selection note: the linked 2018 OAG year-in-review PDF was over the cap, several OIFP annual reports were over the cap, and two tiny linked OIFP URLs did not verify as usable under-cap PDFs. Those were excluded before validation.

## Sample

| Row | PDF |
| --- | --- |
| `njoag-01` | Office of Attorney General 2015 Annual Report |
| `njoag-02` | Office of Attorney General 2014 Annual Report |
| `njoag-03` | Office of Attorney General 2013 Annual Report |
| `njoag-04` | Office of Attorney General 2012 Annual Report |
| `njoag-05` | Office of Attorney General 2011 Annual Report |
| `njoag-06` | Office of Attorney General 2010 Annual Report |
| `njoag-07` | Office of Attorney General 2008 Annual Report |
| `njoag-08` | Office of Attorney General 2007 Annual Report |
| `njoag-09` | Office of Attorney General 2006 Annual Report |
| `njoag-10` | Office of Attorney General 2005 Annual Report |
| `njoag-11` | Office of Attorney General 2003-2004 Annual Report |
| `njoag-12` | Law and Public Safety 2000 Annual Report |
| `njoag-13` | Law and Public Safety 1999 Annual Report |
| `njoag-14` | Office of Insurance Fraud Prosecutor 2017 Annual Report |
| `njoag-15` | Office of Insurance Fraud Prosecutor 2013 Annual Report |
| `njoag-16` | Office of Insurance Fraud Prosecutor 2012 Annual Report |
| `njoag-17` | Office of Insurance Fraud Prosecutor 2002 Annual Report |
| `njoag-18` | Office of Insurance Fraud Prosecutor 2001 Annual Report |
| `njoag-19` | Office of Insurance Fraud Prosecutor 2000 Annual Report |
| `njoag-20` | Office of Insurance Fraud Prosecutor 1999 Annual Report |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-jersey-oag-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/new-jersey-oag-annual-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `90.65`
- Median: `93`
- Grades: `18 A / 0 B / 0 C / 0 D / 2 F`
- Rows below `93`: `5`
- p50/p95/max: `21410ms / 42916ms / 48784ms`
- Hard errors/timeouts: `0`
- `false_positive_applied`: `0`

Low rows:

| Row | Score | Main residual |
| --- | ---: | --- |
| `njoag-02` | `90/A` | near-miss reading/heading debt |
| `njoag-03` | `91/A` | near-miss heading debt |
| `njoag-06` | `51/F` | stable native-untagged reading/heading shell debt |
| `njoag-07` | `59/F` | route/analyzer volatility around heading/figure-alt state |
| `njoag-19` | `92/A` | near-miss link/PDF-UA debt |

## Focused Repeat

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-jersey-oag-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/new-jersey-oag-annual-reports-2026-05-26/low-repeat-r1 \
  --limit 5 \
  --cleanup-row-artifacts
```

Low-row repeat result:

- Mean over repeated lows: `84.80`
- Median over repeated lows: `92`
- `false_positive_applied`: `0`

| Row | Primary | Repeat | Note |
| --- | ---: | ---: | --- |
| `njoag-02` | `90/A` | `91/A` | minor volatility |
| `njoag-03` | `91/A` | `98/A` | recovered on repeat |
| `njoag-06` | `51/F` | `51/F` | stable hard failure |
| `njoag-07` | `59/F` | `92/A` | recovered on repeat; route/analyzer volatile |
| `njoag-19` | `92/A` | `92/A` | stable near miss |

The repeat-supported virtual replacement would add `41` raw points, projecting the full source to `92.70`, still below the `93` target. The remaining blocker is the stable `njoag-06` failure.

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for source mean `93`: `47`
- Repeat diagnostic still selected `reading_link_order_candidate`, with `njoag-06` carrying nearly all material upside.

Native reading-order shell diagnostic:

- `safeRouteControlCount`: `0`
- `sequenceCandidateCount`: `0`
- `finalOrphanDebtCount`: `0`
- Selected rows: none

Native source snapshot probe:

- `njoag-06` is `native_untagged`, `29` pages, `137287` text chars, no structure tree, `0` MCID spans, `heading_structure=0`, `reading_order=30`, `layoutHeadingCandidateCount=112`, and classification `no_safe_candidate` with reason `no_high_confidence_visible_content_anchor`.
- `njoag-19` is also `native_untagged` with no safe visible heading anchor, but it is only one raw point below the target.
- `njoag-07` has tagged structure and visible-anchor-style evidence, but the primary run was blocked by repeated `pdfua.figure.alt_present` PAC regressions while the repeat recovered through existing tools. Treat it as volatility evidence, not a new accepted rule.

## Decision

No source change was accepted for this holdout.

The only stable high-impact failure is a native-untagged structure-bootstrap case where current tools already attempt `bootstrap_struct_tree` and `synthesize_basic_structure_from_layout`, but the latter returns `existing_marked_content_blocks_without_promotable_structure`. Promoting a broader layout-synthesis rule from this single hard row would be too broad without controls, and the existing reading-order shell found no safe sequence candidate.

No original-50 validation was required because no scoring, planning, remediation, or API behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
