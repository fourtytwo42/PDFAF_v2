# Table Parent Ownership Probe

Date: 2026-05-27

Status: diagnostic-only. No scoring, planner, PAC gate, mutator, remediation, semantic, ODL/PAC/POC runtime, source-gate, filename-gate, row-gate, or hash-gate behavior changed.

## Purpose

The table orphan-MCID cleanup candidate proved that appending broad orphan cleanup after rejected table moves is not safe. This stage moves earlier in the transaction: it probes whether the table tools themselves create parent/content ownership side effects while improving table evidence.

The new source diagnostic is:

```bash
scripts/table-parent-ownership-probe.ts
```

It runs native table tools step-by-step on selected PDFs:

1. `normalize_table_structure`
2. `repair_native_table_headers`
3. `set_table_header_cells`

For each step it records score, table score, PDF/UA score, orphan MCID count, ParentTree debt, table-header debt, table regularity debt, planned params, requested refs, wrong refs, PAC regressions, and whether table movement was clean or ownership-regressing.

It does not write remediated PDFs as source assets, call ODL/PAC/POC/Java/semantic AI, change production routing, or alter scoring.

Focused checks passed:

```bash
npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts
npx -y node@22 /usr/bin/pnpm run lint
```

## Probe Pack

Local scratch root:

```text
/mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1
```

Rows:

- Focus rows: `mtcourts-05`, `mtcourts-09`, `uscourts-04`, `pscan-06`, `pscan-08`.
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4683`.

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-parent-ownership-probe.ts \
  --out /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/probe-r1 \
  --control mtcourts-01 \
  --control uscourts-02 \
  --control pscan-13 \
  --control orig-4683 \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/mtcourts-01.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/mtcourts-05.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/mtcourts-09.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/uscourts-02.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/uscourts-04.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/pscan-06.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/pscan-08.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/pscan-13.pdf \
  --pdf /mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/input/orig-4683.pdf
```

Diagnostic output:

```text
/mnt/pdf-review/table-parent-ownership-probe-2026-05-27-r1/probe-r1/table-parent-ownership-probe.md
```

Decision: `plan_parent_ownership_preservation`

Reason:

- `focus_parent_ownership_regression_without_control_or_wrong_ref_blocker`

Summary:

| Bucket | Rows |
| --- | --- |
| Ownership regression candidates | `mtcourts-05`, `mtcourts-09` |
| Wrong-ref rows | none |
| Control unsafe rows | none |
| Clean table progress rows | `uscourts-04`, `pscan-13`, `orig-4683` |

Step-level evidence:

| Row | Step | Table movement | Ownership movement |
| --- | --- | ---: | --- |
| `mtcourts-05` | `normalize_table_structure` | `0 -> 9` | orphan MCIDs `30 -> 30`, clean |
| `mtcourts-05` | `set_table_header_cells` | `9 -> 16` | orphan MCIDs `30 -> 34`, side effect |
| `mtcourts-09` | `normalize_table_structure` | `0 -> 9` | orphan MCIDs `30 -> 31`, side effect |
| `mtcourts-09` | `set_table_header_cells` | `9 -> 16` | orphan MCIDs `31 -> 30`, clean |
| `uscourts-04` | table steps | `0 -> 44` | orphan MCIDs `12 -> 9`, clean |
| `pscan-13` | table steps | `0 -> 23` | orphan MCIDs unchanged at `64`, clean |
| `orig-4683` | table steps | `6 -> 100` | orphan MCIDs unchanged at `64`, clean |

Public Safety focus rows `pscan-06` and `pscan-08` produced no table score movement in the isolated table-tool probe, so they remain separate target-resolution/no-useful-movement evidence rather than parent-ownership candidates.

## Decision

Do not promote behavior yet.

The probe gives a cleaner next behavior target than the rejected cleanup-after-table candidate: preserve parent/content ownership inside `normalize_table_structure` and `set_table_header_cells` when those tools move real table evidence.

The next behavior proof should not add another cleanup sequence. It should:

1. compare target table subtree MCID ownership before/after the specific table mutation;
2. refuse or repair the mutation when table evidence improves but referenced MCID ownership is lost;
3. keep the mutation object-backed to real `/Table` refs;
4. prove at least two focus rows improve or avoid side effects while controls remain stable;
5. then run original-50 deterministic validation before acceptance.

No original-50 validation was required for this stage because it is diagnostic-only.

Downloaded PDFs and generated probe artifacts were local scratch only and were deleted after metrics extraction.
