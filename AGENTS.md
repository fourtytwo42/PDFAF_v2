# Repository Working Rules

- Commit and push after every major completed change.
- Do not include local verification artifacts in commits unless they are explicitly required source assets.
- Keep PDF payloads and generated Base64 content out of logs, docs, and commits.
- Before starting any local LLM instance or benchmark path that can spawn one, first check whether an existing LLM process or listener is already running, such as `llama-server` on the expected port. Reuse the existing instance when possible and do not start a second copy on the same machine unless explicitly required.

# Stage Notes

- Stage 43C is provisionally paused: table normalization gains are useful and speed is healthy, but protected-row preservation still needs refinement before acceptance.
- Stage 44 is now frozen as a provisional checkpoint rather than an accepted gate-passing stage. The best measured full run remains `Output/experiment-corpus-baseline/run-stage44.8-full-2026-04-23-r1`: mean `89.36`, median `95`, grades `31 A / 11 B / 1 C / 3 D / 4 F`, attempts `850`, false-positive applied `0`.
- Stage 44 provisional debt is now tracked as:
  - protected-row instability on `fixture-teams-original` and `fixture-teams-remediated`
  - runtime tail on `structure-4076` and `structure-4438`
  - Stage 41 still failing on protected regressions and p95
- Stage 45 is cleanup/stabilization work only: simplify the orchestrator and preserve the measured Stage 43/44 general gains without adding more broad protected-row heuristics.
