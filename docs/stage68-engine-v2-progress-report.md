# Engine v2 Progress Report Through Stage 68

Date: 2026-04-25
Current commit: `00be18e`

## Executive Summary

Stages 49-68 shifted the project from row-chasing on the legacy 50-file corpus to a broader v1-derived validation strategy. The engine now has two local edge-mix corpora, repeat diagnostics, replay instrumentation, and several accepted deterministic structural fixes. The current state is materially better on the new PDFs, with `false-positive applied = 0` preserved across accepted runs.

The remaining blockers are not mostly missing fixers. They are now split into explicit debt buckets:

- Non-canonicalizable Python structural analyzer volatility.
- Manual/scanned policy debt.
- Legacy protected-row parity debt on the old 50-file corpus.
- A small number of stable residual rows that may not justify more fixer work before end-gate reconciliation.

## Current Quality Snapshot

### Edge Mix 1

Reference run: `Output/from_sibling_pdfaf_v1_edge_mix/run-stage68-edge-mix-2026-04-25-r1`

- Mean: `84.17`
- Median: `93.5`
- Grades: `8 A / 0 B / 1 C / 1 D / 2 F`
- Attempts: `220`
- False-positive applied: `0`

Notes:

- Repeated Stage64 gains remain present on `v1-3921` and `v1-4145`.
- Low rows are already parked analyzer-volatility rows: `v1-4139`, `v1-4567`, and `v1-4683`.

### Edge Mix 2

Reference run: `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage68-edge-mix2-2026-04-25-r1`

- Mean: `87.31`
- Median: `94.5`
- Grades: `11 A / 2 B / 0 C / 1 D / 2 F`
- Attempts: `234`
- False-positive applied: `0`

Notes:

- `v1-4722` improved to `94/A` after Stage 68.
- Remaining Fs are manual/scanned policy rows: `v1-3479` and `v1-3507`.
- `v1-4171` remains parked analyzer-volatility debt.

## Accepted Structural Gains

### Figure/Alt Recovery

Stages 50, 59, and 64 added general checker-visible figure/alt recovery improvements.

Key repeated gains:

- `v1-3921`: stabilized at `91/A`.
- `v1-4145`: improved from `59/F` to `78/C`.
- `v1-4758`: stabilized at `90/A`.
- `v1-4699`: improved to `90/A`.
- `v1-4700`: stabilized at `84/B`.

The fixes remain general: reachable figure targeting, role-map/checker-visible parity, bounded multi-target alt progression, and strict `applied` truthfulness.

### Hidden Heading Parity

Stage 52B added final-only hidden-heading parity for rows with structured root-reachable heading evidence.

Important constraint:

- This remains final/report-time only.
- It does not alter analyzer output, planner routing, scorer weights, or remediation decisions.

### Table Normalization

Stage 62 introduced narrow strongly-irregular-table normalization. Stage 68 extended only the proven bounded case.

Key result:

- `v1-4722`: `69/D -> 94/A`
- `table_markup`: `16 -> 72`
- Remaining strongly-irregular tables: reduced to `1`
- False-positive applied: `0`

The Stage 68 change is intentionally narrow:

- Only the strongly-irregular dense-table path was expanded.
- The bound increased from `2` tables/pass to `4` tables/pass.
- Synthetic cell cap increased for that path.
- No new table route, scorer change, retry policy, or filename-specific behavior was added.

## Parked Debt

### Analyzer Volatility

Stage 66 classified all currently volatile rows as non-canonicalizable Python structural drop/count variance, not simple ordering variance.

Parked analyzer-volatility rows:

- `v1-4122`
- `v1-4139`
- `v1-4171`
- `v1-4215`
- `v1-4487`
- `v1-4567`
- `v1-4683`

Decision:

- Do not retry strict traversal/dedup canonicalization.
- Do not build new fixers on these rows unless analyzer determinism work is explicitly resumed.

### Manual/Scanned Policy Debt

Manual/scanned rows remain out of deterministic structural remediation scope:

- `v1-3479`
- `v1-3507`

Decision:

- Do not add OCR/LLM/semantic expansion unless it becomes an explicit policy stage.

### Legacy 50-File Debt

The legacy Stage 45/48 debt remains parked:

- Teams protected-row parity instability.
- Runtime tail on `structure-4076` / `structure-4438`.
- Stage 41 gate still not resumed as the active target.

## Process Improvements Added

The project now has better decision tooling:

- Stage 49 edge-mix runner for local v1-derived corpora.
- Stage 51 acceptance isolation to separate new-fixer regressions from legacy protected volatility.
- Stage 54 replay instrumentation with `debug.replayState`.
- Stage 56B/58/66 analyzer volatility diagnostics.
- Stage 65 repeatability decision report.
- Stage 67 stable residual selector.
- Stage 68 table residual diagnostic.

These tools are now the guardrails for future changes: fix stable, repeated, general structural problems only; park volatile or policy-bound rows explicitly.

## Current Readiness Against End Gate

Hard requirements currently holding:

- `false-positive applied = 0` on accepted edge-mix runs.
- No generated artifacts committed.
- Fixes remain deterministic and structural.
- No scorer-weight changes, filename-specific logic, OCR expansion, LLM expansion, or public API changes.

Still not complete:

- Legacy 50-file corpus has not been reconciled after the edge-mix stages.
- Analyzer-volatility rows are parked, not solved.
- Manual/scanned policy debt remains out of scope.
- End-gate repeatability has not been rerun after Stage 68 across all required sets.

## Recommended Next Step

Move to legacy/end-gate reconciliation rather than another narrow fixer.

Recommended Stage 69:

- Run the legacy 50-file corpus on the current engine.
- Compare against Stage 45 and the Stage 42 protected baseline where relevant.
- Classify changes as current-fixer regression, known protected parity debt, analyzer volatility, runtime tail, or real structural improvement.
- Do not mutate behavior unless the report finds a simple reporting or diagnostic bug.

Rationale:

- The stable edge-mix structural residuals have been materially reduced.
- The remaining low edge-mix rows are mostly parked analyzer volatility or manual/scanned policy debt.
- More fixer work now risks optimizing around known volatile rows instead of moving toward the documented `Engine v2 General Acceptance` end gate.
