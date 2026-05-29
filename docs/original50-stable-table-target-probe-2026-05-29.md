# Original-50 Stable Table Target Probe

Date: 2026-05-29

## Summary

A diagnostic-only Python helper command now compares production identity
structure traversal with stable structure-object-key traversal for table target
visibility. Normal analyzer, API, remediation, scorer, benchmark, Docker, and
planner paths still use the existing production traversal behavior.

The probe confirms that `4516` and `4438` are different table problems:

- `4516` is a stable-key traversal blocker. Production identity traversal can
  falsely stop after a few elements and see `0` tables; stable traversal sees
  `17` real reachable `/Table` refs.
- `4438` is not a stable-key traversal blocker. Both identity and stable modes
  see the same high-volume table debt, so it remains a control for any later
  table behavior.

## Source Change

Diagnostic command:

```bash
python3 python/pdf_analysis_helper.py --diagnose-stable-table-targets <pdf>
```

The command runs both modes and writes JSON with:

- final structure counts,
- traversal counters,
- table header audit,
- per-table refs, roles, reachability, row/cell/header counts, irregularity,
  spans, and MCID subtree counts.

The normal `traverse_struct_tree(...)` default remains identity-based. Stable
visit-key traversal is reachable only through this explicit diagnostic command.

## Local Evidence

Local raw outputs:

- `/mnt/pdf-review/pdfaf-validation/stable-table-targets-4516.json`
- `/mnt/pdf-review/pdfaf-validation/stable-table-targets-4438.json`

`4516`:

- Identity traversal:
  - queue pops: `8`
  - visited: `5`
  - duplicate identity hits: `3`
  - root-reachable keys: `7059`
  - tables: `0`
- Stable traversal:
  - queue pops: `7269`
  - visited: `7265`
  - duplicate stable-key hits: `4`
  - root-reachable keys: `7059`
  - headings: `34`
  - figures: `25`
  - tables: `17`
  - paragraph struct elements: `2000` capped
  - table header audit:
    - `tablesChecked=17`
    - `headerAssociationMissingCount=2`
    - `dataCellsWithoutHeaderCount=2`
  - top table refs are real reachable `/Table` objects such as `1369_0`,
    `1375_0`, `1423_0`, `1474_0`, `1490_0`, `1512_0`, `1527_0`, and `1548_0`.

`4438`:

- Identity traversal:
  - queue pops: `8000`
  - visited: `8000`
  - duplicate identity hits: `0`
  - root-reachable keys: `14213`
  - tables: `29`
- Stable traversal:
  - same visible table shape: `29` tables
  - table header audit:
    - `tablesChecked=28`
    - `headerAssociationMissingCount=28`
    - `dataCellsWithoutHeaderCount=645`
  - top table refs are real reachable `/Table` objects such as `14958_0`,
    `14965_0`, `14972_0`, `14979_0`, and `15149_0`.

## Decision

Keep this diagnostic-only. Do not switch production traversal to stable keys
yet, because prior candidate remediation stabilized `4516` to `69/D` and still
failed the original-50 gate.

The next behavior proof should be narrowly scoped:

1. Pair stable traversal with a general repair for real reachable `/Table` refs
   already visible under stable traversal.
2. Treat `4516` as an irregular/headered-table cleanup focus row. It has only
   small header-association debt under stable traversal, but multiple irregular
   table rows.
3. Treat `4438` as a missing-header/high-volume control row. Any `4516` repair
   must not accidentally broaden into `4438` unless separately proven safe.
4. Preserve PAC truth: no scorer masking, no PAC suppression, no source/file/row
   gates, and no non-table PAC regressions.

This advances Phase 1 by separating a quality-preserving analyzer fix from the
specific table repair still needed before original-50 can become a stable
acceptance gate again.
