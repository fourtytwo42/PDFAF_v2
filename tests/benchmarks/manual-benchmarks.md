# Manual performance benchmarks (Phase 5)

These targets are **not** run in CI. Use them to spot regressions on a representative machine after changes to analysis, remediation, or infrastructure.

## How to run

1. Install production-like dependencies (`qpdf`, Python + `pikepdf` + `fonttools`, optional `tesseract`).
2. `pnpm build && pnpm start` (or `pnpm dev` for local iteration).
3. Time requests with `curl` + `time`, or a small script that records `analysisDurationMs` / `remediationDurationMs` from JSON responses.

## Reference expectations (PRD-style)

| Scenario | p50 (ms) | p95 (ms) |
|----------|----------|----------|
| Analyze ~20-page native tagged | 8_000 | 15_000 |
| Analyze ~20-page untagged | 12_000 | 20_000 |
| Remediate metadata-only style | 15_000 | 25_000 |
| Remediate full deterministic | 45_000 | 90_000 |
| Remediate + semantic (LLM) | 90_000 | 180_000 |
| Playbook fast path | 3_000 | 8_000 |

Environment, CPU, disk, and PDF complexity dominate variance. Record machine specs when filing performance issues.
