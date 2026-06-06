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

### Remote Resume Checklist
- Validate SSH access before running:
  - `ssh -o BatchMode=yes -o StrictHostKeyChecking=no 192.168.50.118 "hostname"`
- After SSH works, pull latest branch and launch one protected-guarded batch:
  - `cd /home/hendo420/PDFAF-v2`
  - `git pull`
  - `git checkout codex/windows-app`
  - `git fetch`
  - `git reset --hard origin/codex/windows-app`
  - `pnpm install`
  - `pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir /home/hendo420/pdfaf-public-cycles/setXX/input --protected-dir <protected-orig-corpus-path> --batch-size 20 --iterations 1 --max-rounds 10 --target-score 93 --work-root /home/hendo420/it-goal-resume --no-delete`
  - If this fails protected, inspect:
  - `cat /home/hendo420/it-goal-resume/batch-001/report.json`
  - `cat /home/hendo420/it-goal-resume/batch-001/report.md`
  - The new report now includes `protectedRows` and a `Protected category regressions` section.

### Remote Access Bootstrap
- If BatchMode authentication stays blocked, perform one-time key setup from this machine:
  - Generate or use an existing local key and add the public half to remote:
    - Local key (from this machine): `%USERPROFILE%\.ssh\pdfaf_work_ed25519`
    - Remote add:
      - `mkdir -p ~/.ssh`
      - `cat >> ~/.ssh/authorized_keys` and paste the local `.pub` key contents
  - Then test key auth:
    - `ssh -i %USERPROFILE%\\.ssh\\pdfaf_work_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=no hendo420@192.168.50.118 "hostname"`
  - For CLI convenience, add `%USERPROFILE%\\.ssh\\config`:
    - `Host pdfaf-work`
    - `  HostName 192.168.50.118`
    - `  User hendo420`
    - `  IdentityFile ~/.ssh/pdfaf_work_ed25519`
    - `  IdentitiesOnly yes`

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
- 2026-06-06 (continued):
  - Follow-up validation attempt: remote keyless batch mode access remains blocked.
    - `ssh -o BatchMode=yes -o StrictHostKeyChecking=no 192.168.50.118 "echo ok"` returns `Permission denied (publickey,password)` immediately.
    - `ssh -vvv` confirms this environment authenticates as `codexsandboxoffline` locally and presents only pubkey/password methods; no private keys are present under `C:\\Users\\CodexSandboxOffline\\.ssh` by default.
  - Additional local checks since this continuation:
    - `python -c "from python import pdf_analysis_helper as p; print('repair_native_reading_order' in p.MUTATORS); print(p.MUTATORS['repair_native_reading_order'].__name__)"` -> `True`, `_op_repair_native_reading_order`.
    - `python -c "import pikepdf; from python import pdf_analysis_helper as p; pdf=pikepdf.Pdf.new(); print(p._mut_repair_native_reading_order(pdf))"` -> `False` (expected no-op for untagged PDF).

## Durable Findings
- Each batch writes:
  - `batch-XXX/report.json`
  - `batch-XXX/report.md`
- Copy durable findings (failure signatures, regressions, and mitigation decisions) here before major commits.
- Additional local artifact scan evidence (current session):
  - Across local `tmp-goal-20-cycle-*`, only two public-file failures occurred in history: both rows were `2103.00020.pdf` with `status=failed` and `before=44`/`after=0`.
  - Protected-check failures remain concentrated in `worstCategory=17` on runs using `public-batch-20x` + `protected-orig-corpus`.
  - One run (`tmp-cycle-protected-check`) used a malformed protected path (`PDFAF-Work\\`), produced `protectedWorstOverallRegression=-28.05`, and should be treated as a false-positive configuration case.

## Evidence Updates
- Added protected-corpus regression diagnostics to `scripts/progressive-remediation-cycle.ts` report payloads:
  - `BatchReport` now includes `protectedRows` with per-file before/after scores and per-category regressions.
  - `report.md` now emits a `Protected category regressions` section when protected entries regress.
- This supports objective-driven diagnosis of recurring protected regressions (e.g., repeated `worst category regression = 17` in `tmp-goal-20-cycle-*`) before applying remediation/grader changes.

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

## 2026-06-06 (continued)
- Root-cause analysis from local cycle artifacts:
  - Multiple failed protected gates were tied to one regression vector:
    - `pdf_ua_compliance` dropped from `96` to `83` on variants of `2203.08518.pdf` and on `pd-regr-1780243604961-762d8ff37b0a8.pdf`.
  - This maps to finalization mutations and was visible in historical reports:
    - `tmp-cycle-protected-check/batch-001`
    - `tmp-cycle-20x/batch-001`
    - `tmp-cycle-iterative-1/batch-001`
    - `tmp-goal-20-cycle-14/batch-001`
    - `tmp-goal-20-cycle-test/batch-001`
- Implemented in this session:
  - `src/services/remediation/orchestrator.ts`: added score regression gating for post-pass finalization steps (`set_document_title`, bookmark finalization, `embed_urw_type1_substitutes`, `embed_fonts_ghostscript`, and `set_pdfua_identification`) so a mutation is kept only when local score does not decrease.
  - Added shared `analyzePdfBuffer` and `acceptIfNoRegression` helpers.
  - Added `scripts/summarize-progressive-cycles.ts` + `progressive:cycles:summary` to normalize quick review of report artifacts.
- Validation status:
  - Local type-check remains clean (`npm.cmd run lint`).
  - Local vitest execution remains blocked in this environment due config-load/permission errors (`Access is denied` on `../../../..`), so remediation efficacy is still pending remote protected/public re-run.
- Next required step (remote):
  - Re-run a protected-guarded `--public-dir` batch (`20` files) and confirm:
    - `protectedWorstCategoryRegression` <= configured tolerance,
    - `protectedWorstOverallRegression` <= `0`.
  - This will close the evidence gap from this code-path fix and allow commit/push handoff.
