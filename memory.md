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

## Durable Findings
- Each batch writes:
  - `batch-XXX/report.json`
  - `batch-XXX/report.md`
- Copy durable findings (failure signatures, regressions, and mitigation decisions) here before major commits.

## Major Changes (Latest Cycle)
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
