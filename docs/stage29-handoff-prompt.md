# PDFAF v2 Handoff Prompt

You are taking over work in the repository:

- `/home/hendo420/PDFAF_v2`

There is also an older adjacent repository you should use for reference and comparison:

- `/home/hendo420/PDFAF`

That adjacent repo is the v1 codebase. Use it when it helps explain legacy behavior, prior heuristics, or mutation approaches that may still be useful in v2. Do not assume v1 is correct, but do inspect it for prior art before reinventing lower-level PDF mutation logic.

## Primary goal

Get the experiment corpus to **95 or better as graded by the ICJIA checker/API**, while preserving speed.

The target is not just our local scorer. The real acceptance target is the ICJIA-style result.

More specifically:

- Improve detection and remediation quality.
- Do not materially regress remediation speed.
- Avoid broadening slow semantic/LLM behavior in the default path.
- Prefer deterministic fixes that move both our local legal grader and the ICJIA checker.

## Current repository state

Current branch history already includes:

- Stage 26: legal-only scoring split
- Stage 27: bounded heading retries / table repair work
- Stage 28: protected zero-heading convergence lane with runtime guardrails
- Stage 29: Python mutator work to make heading promotion produce root-reachable exported headings

Recent relevant commit:

- `47ae2d2` `Stage 29: harden heading promotion convergence in Python mutator`

Read these files first:

- [python/pdf_analysis_helper.py](/home/hendo420/PDFAF_v2/python/pdf_analysis_helper.py)
- [src/services/remediation/orchestrator.ts](/home/hendo420/PDFAF_v2/src/services/remediation/orchestrator.ts)
- [src/services/remediation/planner.ts](/home/hendo420/PDFAF_v2/src/services/remediation/planner.ts)
- [src/services/headingBootstrapCandidates.ts](/home/hendo420/PDFAF_v2/src/services/headingBootstrapCandidates.ts)
- [src/services/scorer/scorer.ts](/home/hendo420/PDFAF_v2/src/services/scorer/scorer.ts)
- [src/config.ts](/home/hendo420/PDFAF_v2/src/config.ts)

Read these tests next:

- [tests/integration/stage14DeterministicTools.integration.test.ts](/home/hendo420/PDFAF_v2/tests/integration/stage14DeterministicTools.integration.test.ts)
- [tests/remediation/planner.test.ts](/home/hendo420/PDFAF_v2/tests/remediation/planner.test.ts)

## The current grading situation

### Our current legal-only grader

Latest full-corpus legal-remediation run:

- [Output/experiment-corpus-baseline/run-stage26-legal-remediate-2026-04-20-r1/summary.json](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage26-legal-remediate-2026-04-20-r1/summary.json)
- [Output/experiment-corpus-baseline/run-stage26-legal-remediate-2026-04-20-r1/remediate.results.json](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage26-legal-remediate-2026-04-20-r1/remediate.results.json)

Current full-corpus legal-remediation standing:

- mean `77.16`
- grades `17 A`, `9 B`, `4 D`, `20 F`

The remaining legal `D/F` tail is still concentrated in:

- zero-heading files stuck at `58/59`
- table-capped files stuck at `69`
- a few parity outliers like `font-4172`

### ICJIA-side checker standing

Latest full-corpus local ICJIA-checker run:

- [Output/experiment-corpus-baseline/run-stage24-full-2026-04-20-r2-localchecker/icjia_audit_results.json](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage24-full-2026-04-20-r2-localchecker/icjia_audit_results.json)
- [Output/experiment-corpus-baseline/run-stage24-full-2026-04-20-r2-localchecker/icjia_audit_report.md](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage24-full-2026-04-20-r2-localchecker/icjia_audit_report.md)

Current full-corpus ICJIA-side checker standing from that run:

- mean `79.44`
- grades `20 A`, `7 B`, `9 C`, `14 F`
- mean local-minus-checker delta `6.46`

This is still below the desired `95+` corpus target.

## Stage 29 status

There is targeted evidence that the Python heading-promotion fix is real, but not generalized yet.

Representative target-3 run:

- [Output/experiment-corpus-baseline/run-stage29-target3-2026-04-20-r6](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage29-target3-2026-04-20-r6)

Result:

- `structure-4108`: `35/F -> 99/A`
- `short-4192`: `28/F -> 58/F`
- `figure-4188`: `27/F -> 58/F`

Interpretation:

- The Stage 29 Python mutator can now create a real root-reachable exported heading on at least one representative zero-heading file.
- Two key files are still failing because the stage-4 create-heading target is stale or resolves to the wrong structure node.
- The next work is still primarily in heading convergence, not broad planner expansion.

## Where the current blocker lives

The current hard blocker is:

- `create_heading_from_candidate` can now succeed when it reaches the correct paragraph-like node.
- On several stubborn files, the supplied `targetRef` degrades to a stale or structurally wrong node by execution time.
- Some files still need better live candidate recovery when the supplied target becomes unusable.

This is not mainly a scoring problem anymore. It is a detection-plus-remediation convergence problem.

## What to focus on next

### 1. Improve zero-heading convergence

Prioritize the files still pinned at `58/59` because they dominate both our legal grader tail and the ICJIA tail.

Start with:

- `short-4192`
- `figure-4188`
- `short-4074`
- `figure-4082`
- `figure-4184`
- `structure-4078`
- `structure-4122`
- `structure-4207`
- `short-4189`
- `short-4660`

Read the targeted outputs in:

- [Output/experiment-corpus-baseline/run-stage28-target10-2026-04-20-r1](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage28-target10-2026-04-20-r1)
- [Output/experiment-corpus-baseline/run-stage29-target3-2026-04-20-r6](/home/hendo420/PDFAF_v2/Output/experiment-corpus-baseline/run-stage29-target3-2026-04-20-r6)

### 2. Keep table repair as the secondary lane

The `69/D` table-cap files still matter, but they are not the primary blocker until the zero-heading tail clears.

Important table-tail files:

- `figure-4753`
- `figure-4754`
- `structure-4438`
- `font-4699`
- `font-4057`

### 3. Preserve speed

This is a hard constraint.

Do not materially regress:

- mean remediation time
- median remediation time
- p95 remediation time

The Stage 28/29 work already eliminated the worst pathological `repair_structure_conformance` tail in the targeted set. Do not undo that.

Keep these rules:

- no broad new semantic/LLM work in the default path
- bounded retries only
- no extra loops on already-good files
- prefer live deterministic candidate repair over more rounds

## How to use the ICJIA checker locally

Do not rely only on the remote API. We have the checker source locally in `Research`.

Research copy:

- `/home/hendo420/PDFAF_v2/Research/file-accessibility-audit`

That repo is the local copy of the checker/service we have been using as the ICJIA-side proxy.

Important files:

- [Research/file-accessibility-audit/README.md](/home/hendo420/PDFAF_v2/Research/file-accessibility-audit/README.md)
- [Research/file-accessibility-audit/audit.config.ts](/home/hendo420/PDFAF_v2/Research/file-accessibility-audit/audit.config.ts)
- [Research/file-accessibility-audit/apps/api/src/middleware/rateLimiter.ts](/home/hendo420/PDFAF_v2/Research/file-accessibility-audit/apps/api/src/middleware/rateLimiter.ts)

We previously used the local checker with rate limits disabled by making `DISABLE_RATE_LIMITS=1` turn the Express limiter into a no-op in that research copy.

Use the local checker rather than the remote ICJIA API when iterating quickly, then use the remote API only when needed for final verification.

## Benchmark and audit scripts to know

Corpus benchmark/remediation:

- [scripts/experiment-corpus-benchmark.ts](/home/hendo420/PDFAF_v2/scripts/experiment-corpus-benchmark.ts)

Local/remote ICJIA audit helpers:

- [scripts/icjia-audit-run-dir.ts](/home/hendo420/PDFAF_v2/scripts/icjia-audit-run-dir.ts)
- [scripts/icjia-strict-parity-report.ts](/home/hendo420/PDFAF_v2/scripts/icjia-strict-parity-report.ts)

Typical benchmark command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --out Output/experiment-corpus-baseline/<run-id>
```

Typical local checker pattern:

```bash
pnpm exec tsx scripts/icjia-audit-run-dir.ts <run-dir>
```

Use Node 22 for these runs.

## Important environment / verification notes

- Use Node 22 for builds, tests, and corpus runs.
- `better-sqlite3` is not reliable under the default Node 20 shell here.
- Before starting any local LLM or benchmark path that can spawn one, first check if an existing listener/process is already running and reuse it.

## What success looks like

### Immediate success

On the representative zero-heading set:

- at least `5/10` move above `59`
- at least `3/10` reach `B` or `A`
- no runtime blow-up

### Medium success

On the full legal-remediation corpus:

- remove the `D` bucket
- cut the `F` bucket sharply
- raise the full-corpus legal-remediation mean above `77.16`

### Final success

On the ICJIA-side checker or API:

- corpus mean `>= 95`
- no meaningful speed regression versus the current bounded deterministic path

## Things not to do

- Do not optimize only for the local scorer.
- Do not add broad slow semantic remediation just to brute-force the corpus.
- Do not treat bookmarks or PDF/UA diagnostics as the primary target.
- Do not regress runtime to chase a few files.
- Do not commit generated benchmark outputs unless they are explicitly required source assets.

## Good first investigation

Start by tracing `create_heading_from_candidate` end-to-end on:

- `short-4192`
- `figure-4188`
- `structure-4108`

For each one, compare:

- planned target ref and text
- stage-4 execution target ref
- Python mutation debug before/after
- whether the promoted node became root-reachable
- whether the candidate fell back to the wrong live node

Then extend only after the first three make sense.
