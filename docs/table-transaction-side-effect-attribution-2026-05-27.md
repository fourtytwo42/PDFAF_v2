# Table Transaction Side-Effect Attribution

Date: 2026-05-27

Status: diagnostic-only. No scoring, planner, or remediation behavior was changed.

## What Changed

Native table mutation reporting now includes per-requested-ref evidence for table tools:

- `requestedTargetRefs`
- `targetRefDetailsBefore` / `targetRefDetailsAfter`
- resolved/raw role, root reachability, table status, table stats, and skip reason per requested ref
- `changedTargetRefs` and `skippedTargetRefs` in mutation debug where the mutator reports a change

The table transaction diagnostic now separates blockers into:

- `valid_table_no_final_cleanup`
- `planner_wrong_ref`
- `mixed_batch_refs`
- `control_table_side_effect`
- `non_table_pac_side_effect`
- `table_header_pac_only`
- `runtime_or_analyzer_debt`
- `no_safe_transaction`

PAC regressions are also grouped by family: table/header, figure/alt, orphan MCID, link/annotation, reading/order, or unknown.

## Fresh Proof Pack

Local scratch root: `/mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r2`

The pack reused the prior 17-row set:

- Montana Courts table-heavy rows and controls
- U.S. Courts Judicial Business / Supreme Court rows and controls
- Public Safety Canada rows and controls
- Original-50 controls `orig-4076`, `orig-4438`, and `orig-4683`

Validation command used deterministic native remediation only through `scripts/bounded-holdout-validation.ts`, which runs `--no-semantic --no-pdfs`.

Fresh validation summary:

- Rows: `17/17`
- Mean after: `80.7647`
- Mean before: `55.0588`
- Rows below target: `11`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Attribution Result

Diagnostic decision: `diagnostic_only`

Reasons:

- `controls_trigger_table_side_effects`
- `planner_wrong_ref_present`
- `non_table_pac_side_effect_present`

Classification counts:

| Classification | Rows |
| --- | ---: |
| `valid_table_no_final_cleanup` | 3 |
| `planner_wrong_ref` | 3 |
| `mixed_batch_refs` | 0 |
| `control_table_side_effect` | 2 |
| `non_table_pac_side_effect` | 3 |
| `table_header_pac_only` | 0 |
| `runtime_or_analyzer_debt` | 0 |
| `no_safe_transaction` | 6 |

Later strict-transaction-safe focus candidates:

- `mtcourts-06`
- `mtcourts-09`
- `uscourts-01`

Blocked planner wrong refs:

- `pscan-02`: `set_table_header_cells` requested `1299_0`, resolved as `Span`
- `pscan-06`: `set_table_header_cells` requested `10051_0`, resolved as `L`
- `pscan-08`: `set_table_header_cells` requested `1406_0`, resolved to a non-table object with no role

Control side effects:

- `orig-4438`: table tools moved table evidence on an original-50 control
- `orig-4683`: table tools moved table evidence on an original-50 control

Non-table PAC side effects:

- `mtcourts-05`: `pdfua.content.orphan_mcids_absent`
- `pscan-13`: `pdfua.figure.alt_present`
- `uscourts-04`: `pdfua.content.orphan_mcids_absent`

## Decision

Do not add strict table transaction rescue yet.

The improved evidence proves that object-backed table transactions are plausible on some focus rows, but the lane is not safe enough for behavior promotion because:

- the planner can still request non-table refs on table-heavy outside rows;
- original-50 controls still receive table movement under the current broad table sequence;
- non-table PAC side effects are not confined to table/header cleanup.

The next table behavior stage should not broaden table admission. If table work continues, the next diagnostic should target one blocker family at a time:

1. planner wrong-ref prevention for `set_table_header_cells`;
2. control-side-effect gating for high-grade/original table movement;
3. orphan-MCID or figure/alt side-effect cleanup before any broader table transaction.

Generated PDFs and benchmark artifacts are local scratch only and should not be committed.
