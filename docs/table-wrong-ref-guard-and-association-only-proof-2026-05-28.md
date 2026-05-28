# Table Wrong-Ref Guard And Association-Only Proof - 2026-05-28

## Summary

This stage accepts a narrow table safety improvement and keeps the broader table
transaction lane diagnostic-only.

Accepted source behavior:

- `normalize_table_structure` now refuses an explicit `structRef`/target ref
  unless it resolves to a real `/Table` object.
- Explicit non-table refs such as `/P`, `/Span`, `/L`, `/LBody`, `/TD`,
  roleless, unresolved, or otherwise non-table targets no longer reach the
  table normalizer or fall back into broad table mutation.
- `set_table_header_cells` and `repair_native_table_headers` already had this
  explicit-ref guard; this closes the remaining wrong-ref admission gap.

Diagnostic-only change:

- `scripts/table-parent-ownership-probe.ts --missing-header-batch` now makes
  the second header step association-only with `tableHeaderAssociation: true`.
  Once the normalize step creates `/TH` cells, the follow-up should only attach
  deterministic `/Scope`, `/ID`, and `/Headers` evidence. It should not promote
  more `/TD` cells as a side effect.

No scorer changes, PAC exceptions, source/filename/row/hash gates, ODL/PAC/POC
runtime calls, semantic dependency, or broad table admission were added.

## Targeted Proof

Compact local-only proof pack:

- Montana Courts focus/control rows
- U.S. Courts Judicial Business focus/control rows
- Public Safety Canada focus/control rows
- original-50 table-heavy controls

The public PDFs and generated proof artifacts were kept under `/mnt/pdf-review`
only and deleted after metrics extraction.

Post-guard proof command used:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-parent-ownership-probe.ts \
  --missing-header-batch \
  --control mtcourts-01 \
  --control uscourts-02 \
  --control pscan-13 \
  --control orig-4057 \
  --control orig-4438 \
  --control orig-4683 \
  --pdf ...12 local proof-pack PDFs...
```

Post-guard result:

- Decision: `diagnostic_only`
- Ownership-regression candidates: `0`
- Wrong-ref rows: `0`
- Control-unsafe rows: `0`
- Clean table-progress rows:
  - `mtcourts-05`: `55/F -> 59/F`, table `0 -> 26`, orphan `30 -> 30`
  - `mtcourts-09`: `55/F -> 57/F`, table `0 -> 16`, orphan `30 -> 26`
  - `uscourts-04`: `49/F -> 58/F`, table `0 -> 47`, orphan `9 -> 9`
  - `pscan-13`: `58/F -> 59/F`, table `0 -> 12`, orphan `64 -> 64`
  - `orig-4438`: `59/F -> 62/D`, table `0 -> 21`, orphan `64 -> 64`

This proves the wrong-ref blocker and orphan side effect can be removed from the
strict missing-header proof shape. It does not yet prove a score-moving accepted
table transaction, because the main movement is still limited and Public Safety
Canada low rows remain no-movement.

## Original-50 Gate

Validation mode:

- Node 22
- deterministic bounded validation
- semantic disabled
- row artifacts cleaned

`r1` was not accepted as the gate because known route-sensitive rows dipped:

- Mean `93.06`, median `96`
- `false_positive_applied=0`
- hard timeouts/errors `0`
- notable dips: `4076`, `4438`, `4680`, `4683`

`r2` recovered quality but stayed slightly over the runtime p95 gate:

- Mean `95.40`, median `96`
- `false_positive_applied=0`
- hard timeouts/errors `0`
- p95 `169669ms`

Accepted gate is `r3`:

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-table-wrong-ref-guard-2026-05-28-r3/baseline_report.json`
- Mean `95.42`
- Median `96`
- `false_positive_applied=0`
- Hard timeouts/errors `0`
- p95 `135442ms`
- max `261449ms`
- Rows below `93`: `4076` at `90/A`, `4438` at `83/B`, `4516` at `92/A`

Compared with the accepted original-50 floor (`mean 94.24`, `median 95`,
`false_positive_applied=0`, no hard timeouts), the accepted gate improves mean
and median while preserving false-positive and timeout truth. Compared with the
latest local bounded p95 reference around `155s`, the accepted p95 is lower.

## Decision

Accept the explicit wrong-ref guard for `normalize_table_structure` and the
diagnostic association-only proof correction.

Do not promote the broader strict table transaction yet. The active table-heavy
outside-source goal remains open. The next useful table work should use this
cleaner proof shape to target final table/header cleanup or table regularity
movement that materially raises outside-source scores without triggering
controls.
