# Docker API Deterministic Parity, 2026-05-22

## Summary

Docker/API remediation now follows the same deterministic finishing pattern used by the accepted local benchmark path:

- use transient in-memory learning stores per request instead of replaying persistent learned playbooks;
- run deterministic remediation, post-remediation alt cleanup, an optional second deterministic pass for below-A rows with enough wall-clock budget, and a second post-alt cleanup;
- keep OpenDataLoader, PAC/POC research code, Java, and semantic LLM work out of deterministic API validation unless explicitly requested/configured.

This is an API orchestration parity fix only. It does not change scoring rules, PAC evidence, planner predicates, Python mutators, or checker gates.

## Root Cause

The rebuilt Docker image contained the current analyzer/remediation source, but `/v1/remediate` still differed from the benchmark runner in two important ways:

- the route stopped after one deterministic pass plus one late post-alt cleanup;
- the route used the persistent Docker learned-planner database, so stale active playbooks could shortcut the fuller deterministic plan.

That made Docker fast but under-repaired `va-15-report-on-analysis-of-traffic-stop-data-fiscal-year-2022.pdf`: Docker initially stopped at `85/B`, then `89/B` after the second-pass route change, while the accepted local deterministic holdout reached `96/A`.

## Change

`src/routes/remediate.ts` now:

- creates per-request `:memory:` playbook/tool-outcome stores with `initSchema`;
- passes those stores into each deterministic remediation pass;
- admits a second deterministic pass only when:
  - no verified timeout checkpoint was returned;
  - score is still below the remediation target;
  - score is below the second-pass floor, default `93`;
  - enough request budget remains for reanalysis and cleanup;
- merges runtime summaries from multiple deterministic passes;
- records synthetic post-alt cleanup rows with `source: "post_pass"`.

Persistent Docker DB health/playbook reporting remains available, but default API remediation no longer depends on that DB for deterministic quality.

## Verification

Focused tests:

- `pnpm vitest run tests/routes/remediateSemanticMerge.test.ts`
- `pnpm run lint`

Docker rebuild:

- local API image `pdfaf-v2:local`, image id `f53e0f6e81c7`
- running container `pdfafv2-pdfaf-1` healthy on `http://127.0.0.1:6200/v1/health`

Docker API probe summary:

Local artifact: `/mnt/pdf-review/pdfaf-validation/docker-api-current-source-parity-2026-05-22-r3/docker-api-current-source-parity-summary.json`

| Row | Docker API Result | Expected Signal | false_positive_applied |
| --- | ---: | --- | ---: |
| `fixture-accessible` | `96/A -> 96/A` | control stays stable | `0` |
| `va15-table-default` | `54/F -> 96/A` | matches local deterministic holdout | `0` |
| `structure-4438` | `59/F -> 83/B` | analyzer optimization present; no timeout | `0` |

## Decision

Accepted for Docker/API alignment. Future API quality comparisons should use deterministic requests with semantic lanes disabled unless the test is explicitly validating semantic/LLM behavior.
