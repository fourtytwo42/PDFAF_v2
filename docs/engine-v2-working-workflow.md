# Engine v2 Working Workflow

## Purpose

This document captures the workflow that has produced the most reliable progress on Engine v2. Use it before starting any new remediation, runtime, analyzer, or acceptance stage.

The default rule is simple: evidence first, one narrow general change, target validation, corpus validation, then commit.

## Current Status

- Latest end-gate report: `Output/engine-v2-general-acceptance/stage71-end-gate-2026-04-25-r1/stage71-end-gate-report.md`
- Latest committed Stage 71 code/reporting support: `5f48b78`
- Legacy 50-file reference: `Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1`
- Edge mix 1 reference: `Output/from_sibling_pdfaf_v1_edge_mix/run-stage68-edge-mix-2026-04-25-r1`
- Edge mix 2 reference: `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage68-edge-mix2-2026-04-25-r1`
- Stage 71 decision: `defer_acceptance_for_p95_project`
- Stage 72 report: `Output/from_sibling_pdfaf_v1_edge_mix_2/stage72-edge-mix-ab-feasibility-2026-04-25-r1/stage72-edge-mix-ab-feasibility.md`
- Stage 73 report: `Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1/stage73-figure-alt-cleanup-diagnostic.md`
- Stage 73 decision: `diagnostic_only_no_stable_ab_lift`

Stage 71 did not accept the engine because combined edge-mix A/B is `21/28 = 75%`, below the `80%` target. Legacy quality is strong and protected regressions are gone, but p95 remains documented debt.

Stage 72 found that the `80%` edge-mix A/B target is not reachable using only stable non-parked rows. Only `v1-4145` was a stable A/B lift candidate; fixing it would have moved edge mix from `21/28` to `22/28`, still below the `23/28` target.

Stage 73 tested that final stable candidate and did not find an accepted behavior change. The diagnostic confirmed safe role-map figure targets remain, but a bounded third-retag experiment left `v1-4145` at `78/C` with `alt_text=20`, so it was rejected/not kept. Under current deterministic structural guardrails, no stable non-parked edge-mix A/B lift remains.

## Workflow

### 1. Evidence First

Start every stage with existing artifacts or a read-only diagnostic.

Required output:

- The exact run directories being compared.
- Per-row score, grade, category, tool, and runtime deltas.
- A deterministic blocker classification.
- A clear statement of whether a safe general fix exists.

Do not implement a fixer just because one row is low. A fixer needs a repeated mechanism, a critical gate blocker, or a canary row with a general invariant-backed path.

### 2. Bucket the Debt

Classify every low or volatile row before changing behavior.

Use these buckets:

- `stable_structural_residual`: deterministic PDF structural debt with a plausible checker-visible fix.
- `parked_analyzer_volatility`: Python structural count/drop variance or non-canonicalizable analyzer variance.
- `manual_scanned_policy_debt`: likely scanned/manual content where deterministic structural repair is not enough.
- `protected_runtime_or_parity_debt`: protected-row parity or Teams-style floor debt.
- `runtime_tail_debt`: slow path debt without a safe quality-preserving suppression yet.
- `resolved_high`: A/B rows that should be controls, not targets.

Parked rows must not drive fixer acceptance.

### 3. One Narrow General Fix

Implement exactly one behavior change per fixer stage.

The change must be general:

- No filename rules.
- No publication ID rules.
- No corpus-specific routing.
- No v1-score tuning.
- No scorer-weight changes to hide failures.

The change must be truthful:

- `applied` requires checker-visible structural improvement after reanalysis.
- Failed invariants stay `no_effect`, `failed`, or `rejected`.
- False-positive applied must remain `0`.

### 4. Target Validation First

Run a target set before any full corpus.

A target set should include:

- Primary rows that prove the fix.
- Stable controls that should not change.
- Sensitive rows if shared orchestrator/planner behavior changed.
- Excluded/parked rows only for observation, not acceptance.

Accept target only if:

- Primary rows improve materially.
- No control row drops by more than `2` points.
- False-positive applied remains `0`.
- Attempts increase only within the bounded policy for that tool family.

### 5. Corpus Validation

Use the right corpus for the stage:

- Edge-mix corpus for new general structural fixers.
- Both edge-mix corpora for repeatability and end-gate evidence.
- Legacy 50-file corpus for Stage 41/gate or general acceptance reconciliation.

Compare against the accepted reference for that branch, not just the previous failed experiment.

### 6. Repeatability and Volatility

If results swing, stop adding fixers and run repeat diagnostics.

Decision rules:

- Same state with different accept/reject outcome: fix acceptance determinism.
- Same state with different next tool: add stable tie-breaking.
- Different upstream state: do not add guards blindly.
- Python structural count/drop variance: park it unless a quality-preserving analyzer design exists.
- Strict dedup/canonicalization that stabilizes at lower quality is rejected evidence, not a base.

### 7. Decision Stages

After several fixers, add a diagnostic/selection stage instead of another fixer.

A decision stage should:

- Reclassify all remaining low rows.
- Separate accepted gains from volatility.
- Select exactly one next direction.
- Update `AGENTS.md` and the roadmap.

If no safe fixer is identified, ship diagnostic-only and choose a different branch.

### 8. Commit Discipline

After each accepted source/docs/test change:

- Run the relevant verification.
- Commit and push.
- Do not commit generated `Output/...`, PDFs, reports, caches, Base64 payloads, or local corpus payloads.

Reports under `Output/...` can be referenced by docs, but they remain generated artifacts.

## Current Branch Options

### Option A: `end_gate_target_revisit`

Goal: update the acceptance decision now that the single-row stable A/B cleanup branch has been exhausted.

Use Stage 71, Stage 72, and Stage 73 evidence. The remaining blockers are policy/project decisions rather than an obvious next deterministic structural fixer.

### Option B: `p95_project`

Goal: close or materially reduce the Stage 69 `runtime_p95_wall` failure without quality regression.

Start from Stage 69, not Stage 70. Treat the Stage 70 high-alt repeated-figure-alt skip as rejected evidence. Only suppress repeated no-gain work when same-state proof exists.

### Option C: `accept_with_waiver`

Goal: accept the current Engine v2 general checkpoint with explicit waivers.

Required waivers:

- Stage 69 p95 gate failure.
- Edge-mix combined A/B at `75%` instead of `80%`.
- Parked analyzer volatility.
- Manual/scanned policy debt.

This is a policy decision, not an engineering fix.

## Recommended Next Move

Choose `end_gate_target_revisit`.

Reason:

- Legacy quality is already strong.
- Protected regressions are gone.
- False-positive applied is `0`.
- Stage 73 exhausted the only stable non-parked edge-mix A/B lift candidate without material score/category improvement.
- The remaining acceptance blockers are p95 debt, parked analyzer volatility, manual/scanned policy debt, and the edge-mix A/B target itself.
- Further structural fixer work should wait until we explicitly choose a p95 project, analyzer-volatility project, or acceptance waiver/rebaseline path.

Do not pull a third v1 corpus until one of the current Stage 71 blockers is closed or explicitly waived.
