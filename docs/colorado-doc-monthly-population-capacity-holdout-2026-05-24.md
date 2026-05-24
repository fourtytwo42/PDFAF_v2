# Colorado DOC Monthly Population and Capacity Holdout - 2026-05-24

## Source

- Source page: `https://spl.cde.state.co.us/artemis/crserials/cr110011internet/`
- Agency/source: Colorado Department of Corrections reports archived by the Colorado State Publications Library
- Sample: first 20 monthly population and capacity report PDFs in the archive listing
- Constraint: all counted PDFs were public archive PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/colorado-doc-monthly-population-capacity-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `28.00 -> 85.55`
- Median after remediation: `94`
- Grades after remediation: `16 A / 0 B / 0 C / 0 D / 4 F`
- Rows below `93`: `4`
- Runtime p50/p95/max: `24870ms / 35931ms / 37981ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `codocpopcap-01` | January 2026 Monthly Population and Capacity Report | 1163708 |
| `codocpopcap-02` | February 2026 Monthly Population and Capacity Report | 1247560 |
| `codocpopcap-03` | March 2026 Monthly Population and Capacity Report | 1239284 |
| `codocpopcap-04` | January 2025 Monthly Population and Capacity Report | 1124467 |
| `codocpopcap-05` | February 2025 Monthly Population and Capacity Report | 1717412 |
| `codocpopcap-06` | March 2025 Monthly Population and Capacity Report | 362375 |
| `codocpopcap-07` | April 2025 Monthly Population and Capacity Report | 364304 |
| `codocpopcap-08` | May 2025 Monthly Population and Capacity Report | 365438 |
| `codocpopcap-09` | June 2025 Monthly Population and Capacity Report | 367091 |
| `codocpopcap-10` | July 2025 Monthly Population and Capacity Report | 368771 |
| `codocpopcap-11` | August 2025 Monthly Population and Capacity Report | 518053 |
| `codocpopcap-12` | September 2025 Monthly Population and Capacity Report | 881425 |
| `codocpopcap-13` | October 2025 Monthly Population and Capacity Report | 967816 |
| `codocpopcap-14` | November 2025 Monthly Population and Capacity Report | 1276511 |
| `codocpopcap-15` | December 2025 Monthly Population and Capacity Report | 969872 |
| `codocpopcap-16` | January 2024 Monthly Population and Capacity Report | 1108839 |
| `codocpopcap-17` | February 2024 Monthly Population and Capacity Report | 1110325 |
| `codocpopcap-18` | March 2024 Monthly Population and Capacity Report | 1115164 |
| `codocpopcap-19` | April 2024 Monthly Population and Capacity Report | 1119614 |
| `codocpopcap-20` | May 2024 Monthly Population and Capacity Report | 1120772 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `149`
- Low rows: `codocpopcap-05`, `codocpopcap-16`, `codocpopcap-17`, and `codocpopcap-19`
- Shared residual shape: `heading_structure=0`, `reading_order=30`, `pdf_ua_compliance=100`, `table_markup=100`

Focused repeat:

- Rows repeated: four lows plus four nearby A-grade controls
- Low rows reproduced at `51/F`: `codocpopcap-05`, `codocpopcap-16`, `codocpopcap-17`, `codocpopcap-19`
- Controls reproduced at `94/A`: `codocpopcap-01`, `codocpopcap-03`, `codocpopcap-18`, `codocpopcap-20`
- `false_positive_applied`: `0`

Reading-order shell diagnostic:

- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `1`
- Selected rows: none

Existing tools distinguish these rows inconsistently. The A-grade rows reach structure through existing bootstrap/degenerate native routes and later cleanup. The four lows remain at `51/F` after `synthesize_basic_structure_from_layout` and `tag_native_text_blocks` return `existing_marked_content_blocks_without_promotable_structure` / `existing_marked_content_blocks_without_promotable_bt_et`. A local manual-title probe showed the existing degenerate native structure mutator can create a better intermediate structure when handed a clean title anchor, but it reached only `74` before later cleanup and did not establish a native, general, control-safe title extractor for these letter-spaced Tableau reports.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

This is a useful future lane for native untagged Tableau-style reports with letter-spaced first-page text, zero headings, and low reading order. The next behavior proof would need a general native title/structure anchor predicate that separates the four lows from already-safe controls and proves final PAC-clean repair improvement. No filename, source, URL, date, or corpus-specific gate should be used.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
