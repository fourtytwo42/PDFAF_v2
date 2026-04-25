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

Current end-gate status after Stage 71:

- Stage 71 report: `Output/engine-v2-general-acceptance/stage71-end-gate-2026-04-25-r1/stage71-end-gate-report.md`
- Decision: `defer_acceptance_for_p95_project`
- Legacy Stage 69 reference remains the best 50-file candidate: mean `91.48`, median `96`, grades `35 A / 9 B / 2 C / 2 D / 2 F`, attempts `814`, false-positive applied `0`, protected regressions `0`.
- Stage 69 gate still fails `runtime_p95_wall`; Stage 70 runtime guard was tested and rejected/not kept because the full run still failed p95 and reintroduced protected regressions.
- Edge-mix combined Stage 68 references are mean `85.96`, median `94`, grades `19 A / 2 B / 1 C / 2 D / 4 F`, false-positive applied `0`, A/B `21/28 = 75%`.
- The end-gate does not pass because edge-mix A/B is below the `80%` target. P95 remains documented legacy gate debt, not accepted engine behavior debt from the latest structural fixers.
- Stage 72 feasibility report: `Output/from_sibling_pdfaf_v1_edge_mix_2/stage72-edge-mix-ab-feasibility-2026-04-25-r1/stage72-edge-mix-ab-feasibility.md`.
- Stage 72 found only one stable non-parked A/B lift candidate (`v1-4145`), so stable cleanup can project only to `22/28`, still below the `23/28` target.

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

Stage 71 reached the end-gate report and deferred acceptance. The next branch must be chosen explicitly rather than continuing open-ended fixer work.

Recommended branches:

- `single_row_edge_mix_cleanup`: target `v1-4145`, the only stable non-parked edge-mix A/B lift candidate; follow with end-gate target revisit because this cannot reach `80%` alone.
- `p95_project`: isolate runtime p95 with no score regressions, starting from the Stage 69 candidate and treating the Stage 70 guard as rejected evidence.
- `analyzer_or_policy_waiver`: decide whether parked analyzer-volatility and manual/scanned rows should be waived, rebaselined, or assigned a dedicated project.
- `accept_with_waiver`: accept the Engine v2 general checkpoint with explicit waivers for p95 and the current `75%` edge-mix A/B result.

Stage 73 follow-up: `single_row_edge_mix_cleanup` was attempted as diagnostic-first work. The Stage 73 report is `Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1/stage73-figure-alt-cleanup-diagnostic.md`. A bounded role-map retag progression experiment did not lift `v1-4145` beyond `78/C`, so it was rejected/not kept. The active next branch is now `end_gate_target_revisit`: choose between an explicit waiver/rebaseline, a dedicated p95 project, or a dedicated analyzer-volatility project.

Do not pull a third v1 corpus until one of those branches is selected. More PDFs would broaden evidence without resolving the explicit Stage 71 blockers.

`stable structural gains -> repeatability -> analyzer-volatility decision -> legacy reconciliation -> final acceptance gate`
