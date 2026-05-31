# Repository Memory

## Current Working Goal
- Progressively improve the PDFAF v2 grader and remediation engine through iterative public-PDF cycles, then guard with regression checks before any major release.
- Public-cycle target is a mean score of 93.
- Major remediation/grader changes must include measured before/after evidence and a written regression check before being accepted.
- Workflow stops are required if any protected check drops below baseline.

## Running Procedure
- `pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir <dir> [--protected-dir <dir>] [--iterations N] [--batch-size N]`
- By default, processed source files are deleted after successful remediation; add `--no-delete` for dry-runs.
- Use `--batch-size 20` as the default cadence.
- The workflow is tracked in `tmp/<work-root>` by batch and state file unless `--work-root`/`--state-path` are supplied.
- Add `--no-delete` to keep source files during review.
- Add `--include-failed` to revisit files previously marked failed.

## Durable Findings
- Each batch writes:
  - `batch-XXX/report.json`
  - `batch-XXX/report.md`
- Copy durable findings (failure signatures, regressions, and mitigation decisions) here before major commits.

## Major Changes (Latest Cycle)
- Added `scripts/progressive-remediation-cycle.ts` to automate 20-at-a-time grading, remediation, re-scoring, and batch reporting.
- Added npm script `progressive:cycle`.
- Extended Python helper to support broader integer types and safer ParentTree updates.
- Fixed alt-text remediation for whitespace/empty `/ActualText` and `/Alt` markers on non-figure nodes that are not content-valid, with targeted cleanup to avoid false positives.
- Made Windows-compatible PYTHON execution in phase3/3cc tests by defaulting to `python` on win32 when `PYTHON` is unset.

## Evidence Since 2026-05-31
- `tmp/cycle-set-a` processed 10 public PDFs in one-by-one batches (1 file per iteration) with deletion enabled and a temporary working copy of `data/public_batch_1`.
  - All 10 files passed with post-remediation means >= 93 (after means: 98, 98, 98, 97, 99, 99, 98, 99, 99, 99).
  - Sample command: `pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir tmp/public_set_a --batch-size 1 --iterations 1 --no-protected-check --state-path tmp/cycle-set-a/state.json --work-root tmp/cycle-set-a`
- Regression baseline is still needed for the original 50 protected/original PDFs; only the two public source batches are currently present in-repo, and no protected corpus directory is available yet.

## Last Known Goal State (2026-05-31)
- Current active system goal is to continue iterative public corpus remediation with a 93 mean target and regression safeguards before larger merges.
