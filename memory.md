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
- Regression baseline is still needed for the original 50 protected/original PDFs; no protected corpus directory is available in-repo yet.

## Last Known Goal State (2026-05-31)
- Current active system goal is to continue iterative public corpus remediation with a 93 mean target and regression safeguards before larger merges.
