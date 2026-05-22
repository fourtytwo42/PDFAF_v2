# Statistical Table Preserve-Gate Proof

Date: 2026-05-22

## Scope

This was a focused behavior proof after the BJS, CDCR, and TDCJ public holdouts all pointed at the same blocker: long statistical reports with object-backed table targets, low `table_markup`, and PAC-style table/header association debt.

The tested hypothesis was narrow:

> The existing table structure/header recovery sequence may be too strict because it requires final table-header debt and table-regularity debt to strictly decrease. Allowing debt to be preserved, not increased, might recover public statistical-table rows without weakening PAC honesty.

OpenDataLoader, PAC/POC, Java, semantic AI, and generated PDFs were not used. The proof used deterministic native PDFAF only, `--no-semantic --no-pdfs`, Node 22, per-PDF child timeout `300000ms`, external grace `10000ms`, and temporary artifacts under `/mnt/pdf-review`.

## Temporary Experiment

A local experimental patch changed only the private table-sequence acceptance comparison:

- `finalHeaderDebt >= beforeHeaderDebt` to `finalHeaderDebt > beforeHeaderDebt`
- `tableRegularityDebt(final) >= tableRegularityDebt(before)` to `tableRegularityDebt(final) > tableRegularityDebt(before)`

The intent was to admit a sequence only when final table-header and regularity debt were preserved or improved, never when they increased. The patch was reverted after the proof because it did not move the positives.

## Proof Set

The proof set redownloaded a minimal TDCJ sample under 10 MB:

- Positives: `01-statistical_report_fy2025.pdf`, `03-statistical_report_fy2023.pdf`
- Same-source controls: `08-statistical_report_fy2018.pdf`, `11-statistical_report_fy2015.pdf`
- Original control: `pdfaf_fixture_accessible.pdf`

## Results

- `01-statistical_report_fy2025.pdf`: stayed `62/D`, `false_positive_applied=0`
- `03-statistical_report_fy2023.pdf`: stayed `69/D`, `false_positive_applied=0`
- `08-statistical_report_fy2018.pdf`: held at `94/A`, `false_positive_applied=0`
- `11-statistical_report_fy2015.pdf`: held at `94/A`, `false_positive_applied=0`
- `pdfaf_fixture_accessible.pdf`: held at `96/A`, `false_positive_applied=0`

The positives still rejected table work with `pac_rule_regressed(pdfua.table.header_association_present)`. The preserve-gate relaxation did not expose an accepted recovery sequence.

Focused test after revert:

```text
tests/remediation/orchestrator.test.ts --testNamePattern "table structure/header sequence"
3 passed, 203 skipped
```

## Decision

Decision: `rejected_no_source_behavior_change`.

The blocker is not just an over-strict final acceptance comparison. The current table mutations still increase PAC table-header association debt before any safe recovery sequence can help. Do not retry this lane by weakening the preserve/reduce comparison alone.

## Next Table Requirement

The next table attempt needs to improve mutation truth directly:

- choose stable `/Table` targets,
- preserve existing header ownership while normalizing rows,
- reduce or preserve `pdfua.table.header_association_present` and `pdfua.table.header_cells_associated`,
- keep same-source controls stable,
- preserve `false_positive_applied=0`,
- and pass original-50 quality/speed validation before acceptance.

Until then, the statistical-report table family remains parked.
