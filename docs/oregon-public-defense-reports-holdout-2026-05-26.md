# Oregon Public Defense Reports Holdout - 2026-05-26

## Summary

This holdout sampled 20 public PDFs from the Oregon Public Defense Commission reports/publications page:

- Source: `https://www.oregon.gov/opdc/commission/pages/reports.aspx`
- Selection: first 20 report-like PDFs found on the source page under a strict decimal `10,000,000` byte cap.
- Validation mode: deterministic no-semantic/no-remediated-PDF bounded holdout validation.
- Decision: diagnostic-only; no source behavior change accepted.

The source exposes a repeatable high-impact table/runtime debt cluster, but it is not safe to promote a behavior change from this evidence. Same-source controls also trigger stable table target classes, and the actual remediation trace already attempted table tools on focus rows with PAC regressions or no-effect outcomes.

## Sample

| Row | File | Source Report |
| --- | --- | --- |
| `oropdc-01` | `oropdc-01.pdf` | OPDC Strategic Plan |
| `oropdc-02` | `oropdc-02.pdf` | OPDC IT Strategic Plan |
| `oropdc-03` | `oropdc-03.pdf` | 2025-2027 Public Defense Commission Governor's Recommended Budget |
| `oropdc-04` | `oropdc-04.pdf` | 2025-2027 Public Defense Commission Agency Request Budget |
| `oropdc-05` | `oropdc-05.pdf` | 2026 Legislative Session Report |
| `oropdc-06` | `oropdc-06.pdf` | 2025 Annual Rulemaking Report |
| `oropdc-07` | `oropdc-07.pdf` | Status Report December 2025 |
| `oropdc-08` | `oropdc-08.pdf` | Comprehensive Public Defense Report III December 2025 |
| `oropdc-09` | `oropdc-09.pdf` | 2023 Session Wrap Up Report |
| `oropdc-10` | `oropdc-10.pdf` | 2025 Annual Performance Progress Report |
| `oropdc-11` | `oropdc-11.pdf` | 2024 Annual Performance Progress Report |
| `oropdc-12` | `oropdc-12.pdf` | 2023 Annual Performance Progress Report |
| `oropdc-13` | `oropdc-13.pdf` | Open PDSC Restructuring and Modernization Progress Report |
| `oropdc-14` | `oropdc-14.pdf` | PDSC Strategic Insights Report |
| `oropdc-15` | `oropdc-15.pdf` | PDSC Strategic Insights Report Client Survey |
| `oropdc-16` | `oropdc-16.pdf` | OPDC 6 Year Plan Report |
| `oropdc-17` | `oropdc-17.pdf` | The Right to Counsel in Oregon |
| `oropdc-18` | `oropdc-18.pdf` | OPDC July 2024 Unrepresented Plan |
| `oropdc-19` | `oropdc-19.pdf` | OPDC Hourly Wage Study Final Report |
| `oropdc-20` | `oropdc-20.pdf` | Frequency of Non-Unanimous Felony Verdicts in Oregon |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/oregon-public-defense-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/oregon-public-defense-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean | 82.85 |
| Median | 94 |
| Grades | 13 A / 1 B / 0 C / 4 D / 1 F / 1 timeout |
| Rows below 93 | 7 |
| Errors / timeouts | 0 / 1 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 21.338s / 249.234s / 300.003s |
| Raw points needed for mean 93 | 203 |

Rows below 93:

| Row | Score | Lowest Residual Categories |
| --- | ---: | --- |
| `oropdc-03.pdf` | 0/timeout | `per_pdf_timeout_300000ms` |
| `oropdc-04.pdf` | 56/F | `heading_structure=0`, `table_markup=0`, `text_extractability=64`, `pdf_ua_compliance=71` |
| `oropdc-07.pdf` | 69/D | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71` |
| `oropdc-08.pdf` | 69/D | `table_markup=0`, `reading_order=70`, `pdf_ua_compliance=71` |
| `oropdc-16.pdf` | 69/D | `table_markup=0`, `heading_structure=52`, `pdf_ua_compliance=71` |
| `oropdc-17.pdf` | 69/D | `table_markup=0`, `heading_structure=52`, `pdf_ua_compliance=57`, `reading_order=70` |
| `oropdc-02.pdf` | 84/B | `table_markup=44`, `pdf_ua_compliance=71`, `heading_structure=79` |

## Focused Repeat

The seven rows below 93 were repeated sequentially with the same deterministic bounded validation mode.

| Row | Primary | Repeat |
| --- | ---: | ---: |
| `oropdc-02.pdf` | 84/B | 84/B |
| `oropdc-03.pdf` | 0/timeout | 0/timeout |
| `oropdc-04.pdf` | 56/F | 56/F |
| `oropdc-07.pdf` | 69/D | 69/D |
| `oropdc-08.pdf` | 69/D | 69/D |
| `oropdc-16.pdf` | 69/D | 69/D |
| `oropdc-17.pdf` | 69/D | 69/D |

Repeat subset result:

| Metric | Value |
| --- | ---: |
| Processed | 7/7 |
| Mean | 59.4286 |
| Median | 69 |
| Grades | 0 A / 1 B / 0 C / 4 D / 1 F / 1 timeout |
| Errors / timeouts | 0 / 1 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 77.383s / 300.003s / 300.003s |

The low cluster is stable: the hard timeout reproduced, and every scored low row repeated at the same score.

## Diagnostics

Primary low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed: `203`
- Lane split:
  - `table_target_resolution_needed`: `oropdc-02`, `oropdc-04`, `oropdc-07`, `oropdc-08`, `oropdc-16`, `oropdc-17`
  - `timeout_or_error`: `oropdc-03`

Repeat low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed on the repeated subset: `235`
- Same lane split as the primary run.

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `oropdc-02`, `oropdc-04`, `oropdc-07`, `oropdc-08`, `oropdc-16`, `oropdc-17`
- Unsafe same-source control candidates: `oropdc-01`, `oropdc-09`
- Prior non-table target control row: `oropdc-06`
- Classification counts:
  - `stable_normalize_target`: `7`
  - `stable_header_assoc_target`: `1`
  - `non_table_target_attempt`: `1`
  - `control_or_high_grade_noise`: `3`

Representative tool-trace evidence:

- `oropdc-02`: table normalization/header tools rejected on `pdfua.figure.alt_present` and `pdfua.content.orphan_mcids_absent`, with `set_table_header_cells` also no-effecting or rejecting.
- `oropdc-04`: normalization/header tools rejected on `pdfua.table.header_association_present`; one header-cell target applied but the row remained `56/F`.
- `oropdc-07`, `oropdc-08`, and `oropdc-16`: repeated table normalization/header attempts rejected on `pdfua.table.header_association_present` or no-effected.
- `oropdc-17`: one header association improved, but later table attempts regressed `pdfua.table.rows_regular` or `pdfua.table.header_association_present`.
- Controls `oropdc-01` and `oropdc-09` are high after remediation while still matching stable table target classes, so the predicate is not selective enough for production behavior.

## Decision

No production behavior was accepted from this holdout.

This source is valuable evidence for a future table/header transaction project, but it does not clear the current generalization gates:

- The table debt is real and repeatable.
- Existing table tools already attempted the focus rows.
- The rejected/no-effect traces point to PAC-visible side effects, not merely missing routing.
- Same-source controls trigger stable target classes, making a broad planner admission unsafe.
- The repeated hard timeout on `oropdc-03` is runtime/analyzer debt and should not be treated as a scoring/remediation opportunity.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts remain local only and were cleaned after metrics extraction.
