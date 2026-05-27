# Table PAC Side-Effect Diagnostic

Date: 2026-05-27

Status: diagnostic-only. No scoring, planner, PAC gate, mutator, remediation, semantic, ODL/PAC/POC runtime, source-gate, filename-gate, row-gate, or hash-gate behavior changed.

## Purpose

This stage isolated non-table PAC side effects from table-heavy outside-source table repairs before retrying any strict object-backed table transaction rescue.

Earlier table diagnostics showed three blocker families:

- planner/table tools can still request non-table refs;
- controls can receive table movement;
- table repair attempts can regress non-table PAC families.

This diagnostic focuses only on the third family and keeps wrong-ref rows as precondition blockers rather than treating them as cleanup candidates.

## Diagnostic Added

Source script:

```bash
scripts/table-pac-side-effect-diagnostic.ts
```

The script reads an existing `baseline_report.json` and writes a local JSON/Markdown report. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/semantic AI.

It classifies rows as:

- `side_effect_cleanup_candidate`
- `control_side_effect_blocker`
- `wrong_ref_precondition`
- `table_only_cleanup_candidate`
- `runtime_or_analyzer_debt`
- `no_table_side_effect_evidence`

It groups non-table PAC side effects as:

- `figure_alt`
- `orphan_mcid`
- `link_annotation`
- `reading_order`
- `unknown`

Focused checks passed:

```bash
npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tablePacSideEffectDiagnostic.test.ts
npx -y node@22 /usr/bin/pnpm run lint
```

## Proof Pack

Local scratch root:

```text
/mnt/pdf-review/table-pac-side-effect-2026-05-27-r1
```

The pack reused the 17-row table-heavy proof set:

- Montana Courts table-heavy rows and controls;
- U.S. Courts Judicial Business / Supreme Court rows and controls;
- Public Safety Canada rows and controls;
- original-50 controls `orig-4076`, `orig-4438`, and `orig-4683`.

Validation used deterministic native remediation through `scripts/bounded-holdout-validation.ts`, which runs without semantic work or remediated PDF output:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/table-pac-side-effect-2026-05-27-r1/input \
  /mnt/pdf-review/table-pac-side-effect-2026-05-27-r1/run-r1 \
  --limit 17 \
  --cleanup-row-artifacts
```

Validation summary:

- Rows: `17`.
- Completed: `16`.
- Completed-row mean: `81.0625`.
- All-row mean: `76.2941`.
- Completed-row mean before: `54.8125`.
- Grades after: `8 A / 0 B / 0 C / 6 D / 2 F / 1 ?`.
- Timeout/error rows: `1` (`pscan-02`, `per_pdf_timeout_300000ms`).
- `false_positive_applied`: `0`.

## Side-Effect Result

Diagnostic output:

```text
/mnt/pdf-review/table-pac-side-effect-2026-05-27-r1/diagnostic-r1/table-pac-side-effect.md
```

Decision: `diagnostic_only`

Reason:

- `wrong_ref_precondition_still_present`

Classification distribution:

| Classification | Rows |
| --- | ---: |
| `side_effect_cleanup_candidate` | 3 |
| `control_side_effect_blocker` | 0 |
| `wrong_ref_precondition` | 2 |
| `table_only_cleanup_candidate` | 4 |
| `runtime_or_analyzer_debt` | 1 |
| `no_table_side_effect_evidence` | 7 |

Family distribution:

| Family | Rows |
| --- | ---: |
| `figure_alt` | 0 |
| `orphan_mcid` | 3 |
| `link_annotation` | 0 |
| `reading_order` | 0 |
| `unknown` | 0 |

Side-effect cleanup candidates:

- `mtcourts-05`: table evidence improved before `orphan_mcid` side effect.
- `mtcourts-09`: table evidence improved before `orphan_mcid` side effect.
- `uscourts-04`: table evidence improved before `orphan_mcid` side effect.

Controls with the same non-table side-effect family:

- none.

Wrong-ref preconditions still blocking table behavior:

- `pscan-06`
- `pscan-08`

Runtime/analyzer debt:

- `pscan-02`

Table-only cleanup candidates without non-table side effects:

- `mtcourts-06`
- `orig-4683`
- `pscan-13`
- `uscourts-01`

## Decision

Do not promote strict table transaction behavior from this stage.

The useful new evidence is narrower than the previous blocker map: in this proof run, non-table PAC side effects are only `orphan_mcid`, and they appear only on focus rows. No same-source or original controls triggered the same non-table side-effect family.

That is promising, but not enough for accepted behavior because:

- wrong-ref rows are still present;
- one Public Safety Canada focus row timed out;
- table-only movement still appears on controls and must remain separated from side-effect cleanup;
- no preservation or cleanup behavior has been proven yet.

The next table stage should be a narrow orphan-MCID side-effect proof, not a broader table admission change:

1. inspect table attempts where table evidence improves but orphan MCID count or PAC debt increases;
2. determine whether the side effect comes from table normalization, header repair, artifact remapping, or parent-tree drift;
3. test a bounded preservation/cleanup only on real reachable `/Table` refs;
4. require the same controls to remain stable and `false_positive_applied=0` before any behavior promotion.

No original-50 validation was required because this stage changed diagnostics only. The accepted original-50 floor remains mean `94.24`, median `95`, `false_positive_applied=0`, and no hard timeouts.
