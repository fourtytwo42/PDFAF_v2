# Stage 44 Protected Transaction Handoff

## Purpose

This handoff is for an advanced agent taking over the current Stage 44 closeout. The engine has strong aggregate results, but the Stage 41 benchmark gate still does not pass because protected-row preservation is not stable enough.

The task is not to add broad new remediation behavior. The task is to make the existing figure/alt cleanup path transactionally safe for protected rows, especially Teams-style PDFs, without breaking the long-file fixes that Stage 44.1 recovered.

## Current State

The best current base is Stage 44.1 behavior, not the failed Stage 44.2 or Stage 44.3 experiments.

Best measured full run:

- Run: `Output/experiment-corpus-baseline/run-stage44.1-full-2026-04-23-r3`
- Gate: `Output/experiment-corpus-baseline/stage44.1-benchmark-gate-2026-04-23-r3`
- Corpus result: `33 A / 10 B / 1 C / 2 D / 4 F`
- Mean: `90.16`
- Median: `96`
- Attempts: inside gate
- False-positive applied: `0`
- F count: `4`, better than Stage 42 baseline `5`

Stage 44.1 gate failures:

- `protected_file_regressions`: only `fixture-teams-remediated`
- `fixture-teams-remediated`: Stage 42 baseline `100`, candidate `94`
- Category regression: `reading_order 100 -> 67`
- Trigger path: `repair_alt_text_structure` improves total score and `alt_text`, but preserves a protected reading-order collapse.
- `runtime_p95_wall`: about `93.44s`, roughly `2s` over threshold. Treat this as secondary unless it repeats after the protected-row fix.

Stage 44.2 attempt:

- Tried direct protected rejection of `repair_alt_text_structure` when reading order regressed.
- This made the corpus worse: `29 A / 11 B / 2 C / 2 D / 6 F`, mean `87.66`.
- It blocked necessary alt recovery on Teams, `long-4608`, and other protected rows.
- Do not reapply the broad Stage 44.2 guard.

Stage 44.3 attempt:

- Tried making the global protected best-state tracker stricter.
- Target run regressed `long-4680` and `long-4683`.
- Do not use global stricter best-state restore as the solution.

## Important Files

- Main orchestrator logic: `src/services/remediation/orchestrator.ts`
- Planning and figure classifier logic: `src/services/remediation/planner.ts`
- Python structural mutation truth/invariants: `python/pdf_analysis_helper.py`
- Gate implementation: `scripts/stage41-benchmark-gate.ts`
- Target tests: `tests/remediation/orchestrator.test.ts`
- Integration check for table preservation: `tests/integration/tableNormalization.integration.test.ts`
- Stage note: `AGENTS.md`

## What Is Working

Keep these behaviors intact:

- Stage 42 heading recovery remains accepted.
- Stage 43 table normalization gains are useful and fast, but protected-row preservation remains provisional.
- Stage 44 figure/alt target selection is useful.
- `long-4680` can recover to `87-92` when weak-alt recovery and metadata top-up are not disturbed.
- `long-4683` can recover to `86-92` when metadata top-up and protected handling are not disturbed.
- Font-tail rows `font-3437`, `font-3448`, and `font-3529` stay stable around `86/B`.
- Table gains remain on `figure-4753`, `structure-4438`, `font-4699`, and `long-4700`.
- False-positive `applied` remains `0`; do not weaken Stage 35/36 mutation truthfulness.

## The Real Problem

The core failure is not “alt cleanup is bad” and not “reading-order scoring is too strict.”

The real problem is transactional preservation:

1. Some protected rows need `repair_alt_text_structure` to lift `alt_text`.
2. On `fixture-teams-remediated`, that same cleanup can create a candidate with strong `alt_text` but degraded `reading_order`.
3. Rejecting the cleanup globally leaves Teams rows with low `alt_text`.
4. Accepting it globally can leave `fixture-teams-remediated` below its Stage 42 protected floor.
5. Stricter global best-state restore destabilizes long-file protected recovery.

The likely solution is a dedicated protected transaction for alt cleanup:

- Apply `repair_alt_text_structure` in a transaction.
- Evaluate the resulting analysis.
- Commit only if the transaction reaches protected floor and does not leave baseline-strong categories collapsed.
- If it cannot reach a safe state, roll back only that transaction.
- Do not globally block ordinary alt cleanup or alter unrelated protected rows.

## Recommended Next Implementation

Implement `Stage 44.4: Protected Alt Cleanup Transaction`.

Behavior:

- Only runs when `protectedBaseline` is supplied.
- Only wraps `repair_alt_text_structure` when the current row is protected-sensitive:
  - baseline score is high enough to be protected by the Stage 41 gate, or
  - baseline has `alt_text >= 90` and `reading_order >= 90`.
- It should be a local transaction around the alt cleanup path, not a global rollback policy.
- It should start from the current accepted buffer and snapshot.
- It may run only existing deterministic tools:
  - `repair_alt_text_structure`
  - optionally `normalize_annotation_tab_order` if reading order drops
  - optionally one bounded `remap_orphan_mcids_as_artifacts` only if needed and only if it improves the transaction state
- It must not add new mutators or broaden planner routes.

Commit rules:

- Commit the transaction if:
  - final transaction score is `>= baseline - 2`
  - no new stricter cap exists
  - `alt_text` improves or stays strong
  - `reading_order` is not collapsed; use `>= 90` for baseline-strong reading order
- Roll back the transaction if:
  - it does not reach protected floor
  - it drops any baseline-strong structural category below `90`
  - it depends on legacy free-form notes instead of analyzed category facts
- Record rejected rows with deterministic details:
  - `protected_alt_cleanup_transaction_rollback`
  - include baseline score, candidate score, restored score, floor reason, and category deltas

Do not:

- Do not reintroduce the broad Stage 44.2 guard that rejects all protected alt cleanup with category drift.
- Do not use global stricter best-state restore from Stage 44.3.
- Do not change scoring weights or gate thresholds.
- Do not add LLM, semantic captioning, OCR expansion, ICJIA-specific paths, or batching.
- Do not make public API changes.

## Guardrails

Preserve these hard constraints:

- Stage 41 gate is the acceptance authority.
- Stage 42 accepted run remains the protected baseline:
  - `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`
- Generated `Output/...` artifacts must not be committed.
- Corpus input PDFs and generated reports must not be committed.
- Keep PDF payloads and Base64 out of logs/docs.
- Before benchmark paths, check the existing local listener and reuse it:
  - `ss -ltnp | rg ':5103|llama-server' || true`
- Do not commit unless the Stage 41 gate passes, or explicitly mark the stage as provisional.

## Validation Plan

Required verification:

```bash
python3 -m py_compile python/pdf_analysis_helper.py
npx -y node@22 /usr/bin/pnpm exec tsc --noEmit
npx -y node@22 /usr/bin/pnpm exec vitest run \
  tests/remediation/planner.test.ts \
  tests/remediation/orchestrator.test.ts \
  tests/remediation/orchestratorStage35.test.ts \
  tests/scorer.test.ts \
  tests/benchmark/stage41BenchmarkGate.test.ts \
  tests/integration/tableNormalization.integration.test.ts
```

Target benchmark first:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --file fixture-teams-remediated \
  --file fixture-teams-original \
  --file fixture-teams-targeted-wave1 \
  --file long-4680 \
  --file long-4683 \
  --file long-4608 \
  --file font-3437 \
  --file font-3448 \
  --file font-3529 \
  --file figure-4753 \
  --file figure-4754 \
  --file structure-4438 \
  --file font-4699 \
  --file long-4700 \
  --protected-baseline-run Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7 \
  --out Output/experiment-corpus-baseline/run-stage44.4-target-protected-2026-04-23-r1
```

Target acceptance:

- `fixture-teams-remediated` finishes within Stage 42 floor (`>= 98`) or at least has no protected regression under Stage 41 rules.
- `long-4680` stays within floor (`>= 85`).
- `long-4683` stays within floor (`>= 84`).
- Font-tail rows remain `>= 84`.
- Table gain rows remain materially improved.
- False-positive applied remains `0`.

Full benchmark:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --protected-baseline-run Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7 \
  --out Output/experiment-corpus-baseline/run-stage44.4-full-2026-04-23-r1
```

Gate:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/stage41-benchmark-gate.ts \
  Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7 \
  Output/experiment-corpus-baseline/run-stage44.4-full-2026-04-23-r1 \
  Output/experiment-corpus-baseline/stage44.4-benchmark-gate-2026-04-23-r1
```

Full acceptance:

- Stage 41 gate passes.
- Protected regressions: `0`
- False-positive applied: `0`
- F count: `<= 5`
- Attempts: within Stage 41 gate
- p95: within Stage 41 gate
- Mean should remain near Stage 44.1, ideally around `90`

If only p95 fails:

- Rerun once to confirm noise.
- If repeated, inspect slowest files and remove one redundant protected transaction/post-pass attempt without changing repair behavior.

## Current Workspace Warning

The repository is dirty with many uncommitted Stage 43/44 source changes and many untracked generated artifacts. Before any commit:

- Stage only source/tests/docs needed for the accepted implementation.
- Do not stage `Output/...`, `Input/...`, generated PDFs, generated reports, or cache artifacts.
- Check `git status --short` carefully.

## Suggested Test Additions

Add orchestrator tests for:

- Protected alt-cleanup transaction commits when it reaches floor and reading order remains `>= 90`.
- Protected alt-cleanup transaction rolls back when reading order remains collapsed.
- Transaction rollback does not block `long-4680` weak-alt recovery.
- Metadata top-up still fixes `long-4683` style rows.
- Later rows are marked with deterministic rollback details.

## End State

The handoff is complete when the agent can report:

- Full corpus grades after remediation.
- Gate result and failing gates, if any.
- Whether Stage 44 is accepted or still provisional.
- Files changed and tests run.
- Confirmation that generated artifacts were not committed.
