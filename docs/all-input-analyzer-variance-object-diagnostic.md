# All-Input Analyzer Variance Object Diagnostic

Date: 2026-05-11

This diagnostic repeats source analysis for the analyzer/route volatile rows identified after fresh r4. It is diagnostic-only and does not change scoring, PAC gates, analyzer logic, remediation routing, or timeout defaults.

## Artifacts

- Script: `scripts/all-input-analyzer-variance-object-diagnostic.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/analyzer-variance-object-diagnostic-2026-05-11-r1`
- Input root: `Input`
- Repeats per row: `3`

## Findings

| Row | Scores | Classification | Object Movement |
| --- | --- | --- | --- |
| `4567` | `46/F, 59/F, 59/F` | `mixed_object_variance` | heading, alt, and table evidence swing together |
| `4139` | `29/F, 29/F, 29/F` | `stable_source_analysis` | no source object movement in this repeat |
| `4693` | `59/F, 50/F, 59/F` | `mixed_object_variance` | heading and table evidence swing |

`4567` and `4693` should not drive remediation route guards until analyzer evidence is stabilized or the exact object identity issue is proven. Their source analysis changes before any remediation tool runs.

`4139` is different in this repeat: source analysis is stable and low. Its prior high/low behavior should be treated as remediation-route volatility, not raw source analyzer volatility, unless future source repeats contradict this result.

## Decision

No behavior is selected from this diagnostic.

Safe next directions:

- analyzer evidence design for `4567` and `4693`, with stronger object identity and quality-preserving canonicalization;
- a remediation-route diagnostic for `4139` if it becomes a priority;
- a different direct object-level fixer family for remaining all-input deficit rows.

Unsafe directions:

- route guards for `4567` or `4693`;
- counting one-off high routes toward completion;
- weakening PAC scoring/gates or hiding strict PAC failures.

## r18 Candidate Refresh

After the filename-aware analyzer cache-key refresh, the r18 merged checkpoint still needed `160` points for mean `93`. The highest remaining route-candidate rows were checked with repeated source analysis:

- Local output: `Output/goal-all-input-mean-2026-05-09-r1/analyzer-variance-r18-candidates-2026-05-12-r1`
- `PYTHONHASHSEED=0` probe: `Output/goal-all-input-mean-2026-05-09-r1/analyzer-variance-r18-pythonhashseed0-2026-05-12-r1`

Findings:

| Row | Repeat scores | Classification | Decision |
| --- | --- | --- | --- |
| `4655` / `0033` | `42/F, 46/F, 46/F` | `mixed_object_variance` | Analyzer-object debt, not a route guard target. |
| `4487` / `0075` | `52/F, 44/F, 52/F` | `figure_alt_object_variance` | Analyzer-object debt, not a route guard target. |
| `4683` / `long-4683` | `59/F, 48/F, 48/F` | `mixed_object_variance` | Analyzer-object debt, not a route guard target. |
| `4503` / `0136` | `44/F, 44/F, 44/F` | `stable_source_analysis` | Source stable, but route comparison still diverges upstream; no same-state patch. |
| `ad762d4a` / `0296` | `30/F, 30/F, 30/F` | `stable_source_analysis` | Source stable, but route comparison still diverges upstream; no same-state patch. |

The hash-seed probe did not stabilize the volatile rows in a useful direction. `4655` and `4487` still varied across object families, while `long-4683` stabilized only at the lower-quality `48/F` shape. Do not use `PYTHONHASHSEED=0` as a quality-preserving analyzer fix from this evidence.

## r18 Table/Alt Tail Refresh

The next low-row group was checked for source-analysis stability:

- Analyzer variance output: `Output/goal-all-input-mean-2026-05-09-r1/analyzer-variance-r18-table-alt-candidates-2026-05-12-r1`
- Table/header object output: `Output/goal-all-input-mean-2026-05-09-r1/table-header-object-r18-stable-candidates-2026-05-12-r1`
- `4722` sequence probe: `Output/goal-all-input-mean-2026-05-09-r1/table-structure-sequence-probe-4722-r18-2026-05-12-r1`

Stable source-analysis rows include `4453`, `4105`, `4678`, `4722`, `4147`, `4735`, and `4057`. `4690` and `4519` still show analyzer-object variance, so they should not drive route guards.

The table/header object diagnostic found no simple header-association candidates. Most stable table rows are `irregular_or_direct_table_shape`, meaning table normalization must happen before header association metadata can be trusted.

`4722` remains diagnostic-only. The current probe can produce a high apparent score (`94/A`) through `normalize_table_structure_twice_then_header_cleanup`, but PAC-style table-header debt worsens from `1150` to `1209`, so accepting it would violate the strict-grader goal. Do not add a PAC table-header exception or accept this sequence unless a later cleanup proves final table-header debt is neutral or improved.
