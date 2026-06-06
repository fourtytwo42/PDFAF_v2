# Repository Memory

## Current Working Goal
- Progressively improve the PDFAF v2 grader and remediation engine with an iterative public-corpus loop:
  1) select batches of public PDFs (target 20),
  2) grade/remediate/re-grade,
  3) require public mean >= 93 before advancing,
  4) run protected/original corpus regression checks after each accepted batch, and
  5) keep iterating only while both checks pass.
- If a batch or protected check fails, keep that batch for fixes and rerun; do not advance the loop until both gates pass.
- Workflow stops are required before major merge if protected/original regression drops below baseline.

## Running Procedure
- `pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir <dir> [--protected-dir <dir>] [--iterations N] [--batch-size N]`
- By default, processed source files are deleted only on successful batches; add `--no-delete` to retain files for failed/insufficient batches.
- Use `--batch-size 20` as the default cadence.
- The workflow is tracked in `tmp/<work-root>` by batch and state file unless `--work-root`/`--state-path` are supplied.
- Add `--no-delete` to keep source files during review.
- Add `--include-failed` to revisit files previously marked failed.

### Current Cycle Behavior
- Batch pass requires:
  - all files processed successfully,
  - public mean >= target score, and
  - if enabled, protected check succeeds with no protected-analysis failures and bounded category/overall regression.

- 2026-06-06:
  - Added the first implementation for the `repair_native_reading_order` remediation stage in `python/pdf_analysis_helper.py` and wired it end-to-end through:
    - `src/config.ts` (`REMEDIATION_IMPLEMENTED_TOOLS`, stage mapping already listed),
    - `src/services/remediation/orchestrator.ts` (Python mutation dispatch path).
  - Evidence:
    - `python -c "compile(open('python/pdf_analysis_helper.py', 'r', encoding='utf-8').read(), 'python/pdf_analysis_helper.py', 'exec')` (succeeded)
    - `node .\\node_modules\\typescript\\bin\\tsc --pretty false -p tsconfig.json --noEmit` (succeeded)
  - Attempted local test run: `node .\\node_modules\\vitest\\...` path not present in this workspace for direct invocation.
  - Remote validation blocked in this session:
    - `ssh pdfaf-work` host lookup unavailable.
    - direct IP `192.168.50.118` reached only with password/public-key auth prompt (`Permission denied (publickey,password)`).

## Durable Findings
- Each batch writes:
  - `batch-XXX/report.json`
  - `batch-XXX/report.md`
- Copy durable findings (failure signatures, regressions, and mitigation decisions) here before major commits.

- 2026-06-02:
  - `scripts/progressive-remediation-cycle.ts` now enforces score-gated acceptance in `runPipelineOnFile`:
    - a worker result is only accepted when `parsed.ok` **and** `parsed.after.score >= targetScore`.
    - attempts continue for `safe/full` modes when score is below target.
    - when below target, errors now record: `worker score X below target Y (suffix)`.
  - Executed remote cycle:
    - `ssh pdfaf-work`
    - `pnpm exec tsx scripts/progressive-remediation-cycle.ts`
      `--public-dir /home/hendo420/pdfaf-public-cycles/set03/input`
      `--batch-size 20 --iterations 1 --max-rounds 10`
      `--target-score 93 --no-protected-check --no-delete`
      `--work-root /home/hendo420/it-goal-20260602-B3`
  - Result: `it-goal-20260602-B3/batch-001` FAIL.
    - Public mean: `44.80 -> 94.60` on accepted (`ok`) files
    - Files failed: `5/20` because final worker score remained below `93` after all attempts
    - `05-AnnualReport2017` and `09-AnnualReport2013` still low (`59/F`) unless high-variance run variants improve them
    - Most persistent failure signatures now show up consistently in failed rows:
      - `alt_text` heavy penalties (e.g., 03/19/09/18 variants)
      - `heading_structure` zeros in old annual reports
      - residual `pdf_ua_compliance` drops
    - This confirms earlier silent acceptance of low-score rows was masking partial remediation failures; pass criteria remain strict by design.
  - Additional verification attempt (protected check) with reduced protected sample:
    - command target used `/home/hendo420/pdfaf-public-cycles/set02/sample` with `--max-rounds 1`
    - no report was produced within practical timeout windows; protected path execution remained active without report finalization for extended runtime
    - this run is incomplete in logs and needs follow-up tooling/timeout policy before concluding protected safety behavior for this sample set.

## Major Changes (Latest Cycle)
- 2026-06-02:
  - Executed `scripts/progressive-remediation-cycle.ts` remotely on `ssh pdfaf-work` with safeguards enabled:
    - `--public-dir /home/hendo420/pdfaf-public-cycles/set01/input`
    - `--protected-dir /home/hendo420/pdfaf-public-cycles/set02/input`
    - `--batch-size 20 --iterations 1 --max-rounds 1 --target-score 93`
    - `--protected-reruns-on-failure 1`
    - `--no-delete`
  - Result: `it-cycle-20g2/batch-001` PASS.
    - Public mean: `87.30 -> 95.05`
    - Protected mean: `87.30 -> 94.95`
    - Protected analyzed/fail: `20/20`, protected worst overall regression `-7.65`
    - Protected worst category regression `1` (within 1-point tolerance)
    - `protectedCheckAttempts: 1`, no retry recovery triggered
  - This run confirms the new structural safeguards after code changes:
    - `ensure_accessibility_tagging` link-quality drop rollback path
    - guarded orphan-MCID remap rollback
    - regression roll-forward protection in `scripts/progressive-remediation-cycle.ts`
  - 2nd pass: `2026-06-02` using `/home/hendo420/pdfaf-public-cycles/set03/input` (public) and `/home/hendo420/pdfaf-public-cycles/set02/input` (protected):
    - Result: `it-cycle-20g3/batch-001` PASS.
    - Public mean: `61.10 -> 96.95`
    - Protected mean: `87.35 -> 95.25`
    - Protected analyzed/fail: `20/20`
    - Protected worst overall regression: `-7.90`
    - Protected worst category regression: `0`
    - Protected check attempts: `2` with retry recovery

- 2026-05-31:
  - Updated `scripts/progressive-remediation-cycle.ts` to isolate remediation work in a separate worker process (`scripts/progressive-remediation-worker.ts`), preventing native access-violation crashes from taking down the whole batch loop.
  - Added safe-mode worker profile and retry policy (`safe-10`, `safe-1`, then full modes) to recover from non-deterministic native crashes while preserving regression safeguards.
  - Restored full category-level pass/fail computation in protected checks by returning complete `AnalysisResult` objects from worker output (not just score summaries).
  - Executed `--batch-size 20 --iterations 1 --no-protected-check` on `PDFAF-Work/public-batch-20`:
    - Public mean before: `70.60`, after: `97.00`
    - 20/20 files processed successfully in one batch.
    - Source PDFs were retained because `--no-delete` was set for this pass.
  - Executed with protected regression check using a fixed `protected-orig-corpus` directory containing `pd-regr-*.pdf` files:
    - Command: `--protected-dir .../protected-orig-corpus`
    - Public mean before: `70.70`, after: `97.00`
    - Protected before: `~98.53`, protected after: `98.41`
    - Protected counts: 17 analyzed, 0 failed
    - Protected regressions: worst overall `-0.12` (improved), worst category `0`
  - Ran pass-cycle without `--no-delete` on a copied `public-batch-20` working set to validate deletion behavior:
    - 20/20 files processed successfully, mean before `70.70`, after `96.90`.
    - Source PDFs were deleted after pass (working as expected).
- Added `scripts/progressive-remediation-cycle.ts` to automate 20-at-a-time grading, remediation, re-scoring, and batch reporting.
- Added npm script `progressive:cycle`.
- Hardening (this cycle): only delete source PDFs on successful batches; failed batches are retained.
- Hardening (this cycle): protected guard now requires complete analysis of the protected set and rejects any protected regressions above tolerance.
- Extended Python helper to support broader integer types and safer ParentTree updates.
- Fixed alt-text remediation for whitespace/empty `/ActualText` and `/Alt` markers on non-figure nodes that are not content-valid, with targeted cleanup to avoid false positives.
- Made Windows-compatible PYTHON execution in phase3/3cc tests by defaulting to `python` on win32 when `PYTHON` is unset.

## Evidence Since 2026-05-31
- `tmp-cycle-continue-test/batch-001` (1 file, no-delete mode) improved one file: mean before `44`, mean after `98`, PASS.
- `tmp-cycle-continue-test/batch-002` (remaining 9 files) improved all with mean before `42.67`, mean after `98.44`, PASS.
  - Sample command: `pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir data/public_batch_1 --batch-size 20 --iterations 1 --no-protected-check --work-root C:\Users\hendo420\OneDrive\Documents\GitHub\PDFAF-Work\tmp-cycle-continue-test --state-path C:\Users\hendo420\OneDrive\Documents\GitHub\PDFAF-Work\tmp-cycle-continue-test\state.json`
- Deletion behavior in script is now pass-gated, but this workspace’s original `PDFAF_v2` path blocks in-process file deletion; writable test copies in `PDFAF-Work` do delete correctly.
- Warning observed during runs: analysis persistence warnings `failed to persist result: unable to open database file` are non-fatal but should be investigated (likely environment/cache path write permissions).
- Protected baseline is now tracked in `PDFAF-Work/protected-orig-corpus` (current snapshot contains the available `pd-regr-*.pdf` inputs in this workspace).
- `tmp-cycle-20live/batch-001` (mixed directory mistake) failed protective gate:
  - `public-dir` included both public PDFs and `pd-regr-*` files, so protected-category regression guard failed (`worst category regression=17`) even though public mean exceeded target.
  - This confirmed public source must be strictly public-only for reliable batch selection.
- `tmp-cycle-20live2/batch-001` (public-only pass run) success:
  - Command run on `PDFAF-Work/public-batch-20/public-only` with protected guard against `PDFAF-Work/protected-orig-corpus`.
  - Public mean before `42.80` / after `94.80`, passed (`PASS batch 1`).
  - Protected mean before `98.29` / after `98.29`, protected failures `0`, worst category regression `0`, worst overall regression `0`.
  - Files were deleted after pass (public-only folder ended empty), confirming pass-gated cleanup.
- `tmp-cycle-20live3` verifies continuation control flow:
  - Running the same configured cycle over the emptied public-only folder returns: `No public PDFs found: ...\public-only`.
  - No further batch can be run until a new public source directory (preferably 20 fresh PDFs) is mounted/synced.

## Last Known Goal State (2026-05-31)
- Current active system goal is to continue iterative public corpus remediation with a 93 mean target and regression safeguards before larger merges.
