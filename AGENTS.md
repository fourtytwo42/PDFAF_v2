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
- Stage 45 cleanup/stabilization is now provisionally implemented on top of the frozen checkpoint. Reference run: `Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2` with mean `89.24`, median `95`, grades `31 A / 10 B / 2 C / 3 D / 4 F`, attempts `799`, false-positive applied `0`, and p95 effectively flat versus the freeze checkpoint.
- Stage 45 keeps the same deferred debt:
  - protected-row instability on `fixture-teams-original` and `fixture-teams-remediated`
  - runtime tail on `structure-4076` and `structure-4438`
- Stage 46 should target runtime-tail reduction only, and Stage 47 should return to Teams-only protected parity if needed.
