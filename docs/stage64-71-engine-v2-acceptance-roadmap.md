# Stage 64-71 Engine v2 Acceptance Roadmap

## Purpose

This roadmap defines the path from the current Stage 63 state to a concrete end gate. The goal is to avoid open-ended row chasing: every stage should either improve stable structural residuals, reduce repeatability uncertainty, or move known debt into an explicit bucket.

Current base when this roadmap was written:

- Latest committed stage: `Stage 63 residual decision diagnostic`
- Stage 63 report: `Output/from_sibling_pdfaf_v1_edge_mix_2/stage63-residual-decision-2026-04-24-r1/stage63-residual-decision.md`
- Selected next fixer: `Stage 64: Figure/Alt Recovery v5`
- Parked analyzer-volatility rows: `v1-4683`, `v1-4171`, `v1-4487`
- Manual/scanned debt rows: `v1-3479`, `v1-3507`
- Mixed/no-safe rows: `v1-4139`, `v1-4567`

## End Gate: Engine v2 General Acceptance

The end gate is `Engine v2 General Acceptance`.

Required validation sets:

- Legacy 50-file corpus.
- First v1 edge-mix corpus: `Input/from_sibling_pdfaf_v1_edge_mix/`.
- Second v1 edge-mix corpus: `Input/from_sibling_pdfaf_v1_edge_mix_2/`.

Hard requirements:

- `false-positive applied = 0` everywhere.
- No generated `Output/...`, PDFs, reports, caches, or Base64 payloads committed.
- No filename-specific, publication-specific, or corpus-specific repair logic.
- No scorer-weight changes used to hide structural failures.
- Deterministic-only remediation path unless OCR, LLM, or semantic expansion is explicitly approved as a separate policy stage.

Quality targets:

- Legacy 50-file corpus stays near or above Stage 45/44 aggregate quality with no F-count increase.
- Edge mix 1 and edge mix 2 combined reach at least `80% A/B`.
- No unexplained new Fs.
- Every row below C is assigned to one of:
  - fixable structural residual
  - parked analyzer volatility
  - manual/scanned/OCR policy debt
  - protected-row parity debt

Stability targets:

- At least two repeat runs on both edge-mix corpora.
- Stable rows do not swing by more than `2` points across repeats.
- Rows with larger swings are explicitly marked analyzer-volatility debt and excluded from fixer acceptance.

Performance targets:

- Attempts do not materially exceed the current Stage 62/63 envelope.
- New fixer stages do not create a p95 runtime tail.
- Runtime outliers are either fixed or explicitly documented.

## Phase 1: Stable Structural Fixers

Goal: improve real PDFs using stable evidence only, without building on analyzer-volatility rows.

### Stage 64: Figure/Alt Recovery v5

Use the six stable `figure_alt_residual` rows from Stage 63 as the primary target set.

Rules:

- Fix only general checker-visible figure/alt ownership gaps.
- No filename, corpus, or publication-specific targeting.
- No scorer changes, OCR/LLM expansion, protected-row parity, or broad retry policy.
- Preserve Stage 35/36 truthfulness: `applied` requires checker-visible structural improvement.

Acceptance:

- At least two stable target rows improve in `alt_text` or final score.
- No control row drops by more than `2` points.
- `false-positive applied = 0`.
- Attempts remain bounded.

### Stage 65: Edge-Mix Repeatability Check

Run both edge-mix corpora at least twice after Stage 64.

Outputs:

- Grade distributions.
- Mean/median/attempts/runtime.
- Row-level swing report.
- Reclassified residual list.

Acceptance:

- Stage 64 gains repeat.
- No new unexplained Fs.
- Stable rows stay within the repeatability envelope.

### Stage 66: Next Structural Family

Choose the next fixer family from Stage 65 evidence only.

Likely options:

- `Table Tail Follow-up v3` if stable table rows still have a new invariant-backed improvement path.
- `Mixed Figure/Table Tail` if multiple stable rows share the same mixed blocker.
- `Manual/Scanned Debt Diagnostic` if deterministic structural fixes are mostly exhausted and remaining low rows are scanned/manual.

Do not select parked analyzer-volatility rows as primary targets.

## Phase 2: Analyzer Volatility

Goal: decide whether analyzer volatility can be fixed safely or must stay documented debt.

### Stage 67: Analyzer Volatility Design

Revisit:

- `v1-4683`
- `v1-4171`
- `v1-4487`

Rules:

- Do not retry the rejected strict traversal/dedup canonicalization.
- Look for quality-preserving canonicalization only.
- If variance is true missing/drop variance from Python structural output, document it instead of forcing a lower-quality stable point.

Acceptance:

- Either harmful swings are materially reduced without lowering best-quality envelopes, or analyzer volatility is explicitly parked with a stronger root-cause note.

### Stage 68: Repeatability Gate

Run edge mix 1 and edge mix 2 three times each.

Acceptance:

- Stable rows remain stable.
- Analyzer-volatility rows are clearly separated from fixer outcomes.
- `false-positive applied = 0`.
- No broad runtime regression.

## Phase 3: Legacy Full-Corpus Reconciliation

Goal: determine whether old protected-row debt still blocks project acceptance.

### Stage 69: Legacy 50-File Regression Check

Run the current engine on the original 50-file corpus.

Compare against:

- Stage 45 baseline.
- Stage 42 protected baseline if Stage 41 gate parity is still being considered.

Classify differences as:

- current fixer regression
- known protected-row parity debt
- analyzer volatility
- runtime tail
- real structural improvement

Do not mutate behavior in this stage unless the report finds a simple reporting bug.

### Stage 70: Teams/Protected Parity Micro-Stage

Only run this if full-corpus protected acceptance is explicitly resumed.

Scope:

- `fixture-teams-original`
- `fixture-teams-remediated`
- optionally `fixture-teams-targeted-wave1` if still implicated

Rules:

- Fix only the exact first divergence path.
- No broad protected replay.
- No global best-state restore.
- No alt-cleanup quarantine outside the proven Teams path.

Acceptance:

- Protected Teams rows no longer regress.
- No non-Teams regressions.
- Aggregate quality/runtime stays within the current accepted envelope.

## Phase 4: Final End Gate

### Stage 71: Engine v2 General Acceptance Run

Run:

- Legacy 50-file corpus.
- First edge-mix corpus.
- Second edge-mix corpus.
- Any additional validation corpus only if it has already been introduced and baseline-classified.

Final report must include:

- Grade distribution per corpus.
- Combined edge-mix grade distribution.
- Mean, median, p95, attempts.
- `false-positive applied` count.
- D/F inventory.
- Parked debt list with reason per row.
- Confirmation that generated artifacts and PDF payloads are uncommitted.

Acceptance:

- End-gate hard requirements pass.
- Edge-mix combined quality target passes.
- Legacy 50-file corpus does not regress from the accepted quality envelope.
- Remaining below-C rows are all explained by explicit debt buckets.

## Current North Star

The immediate next stage is `Stage 64: Figure/Alt Recovery v5`.

The longer path is:

`stable structural gains -> repeatability -> analyzer-volatility decision -> legacy reconciliation -> final acceptance gate`

