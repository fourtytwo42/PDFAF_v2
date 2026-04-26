# Codex Stage Automation Flow

```mermaid
flowchart TD
  A[User starts runner] --> B[Runner creates Output/agent-runs stage folder]
  B --> C[Render coordinator prompt from docs/agent-prompts]
  C --> D[Record metadata and local LLM/listener status]
  D --> E[Launch codex exec worker]
  E --> F[Stream readable progress to terminal and log]
  F --> G[Worker reads AGENTS, docs, artifacts, scripts]
  G --> H{Evidence supports behavior change?}
  H -- No --> I[Create diagnostic script/doc]
  H -- Yes --> J[Make narrow source change]
  I --> K[Run focused validation]
  J --> K
  K --> L{Known wins preserved?}
  L -- No --> M[Reject or revert candidate]
  L -- Yes --> N[Commit and push source/docs/tests]
  M --> O[Write structured summary JSON]
  N --> O
  O --> P{Continuous mode stop reason?}
  P -- blocked/rejected/acceptance_ready/safe_to_implement --> Q[Stop for human decision]
  P -- diagnostic_only/implemented --> R[Increment stage number]
  R --> B
```

## Terminal Views

```text
tmux attach -t pdfaf-stage82
```

shows the live interactive session.

```text
tail -f Output/agent-runs/live/current.log
```

shows the log stream without attaching to tmux.

## Current Pattern

```mermaid
sequenceDiagram
  participant You
  participant Runner
  participant Codex
  participant Repo
  participant Bench as Local Artifacts

  You->>Runner: pnpm run agent:continuous -- --stage 82
  Runner->>Codex: coordinator prompt + output schema
  Codex->>Repo: inspect AGENTS/docs/scripts
  Codex->>Bench: inspect Stage 78-81 evidence
  Codex->>Repo: add diagnostic source/doc
  Codex->>Bench: write generated report under Output/
  Codex->>Repo: run validation
  Codex->>Repo: commit and push source/doc only
  Codex->>Runner: structured stage decision
  Runner->>Runner: decide continue or stop
```

## Safety Gates

```mermaid
flowchart LR
  A[Worker proposal] --> B{Generated artifact staged?}
  B -- Yes --> X[Fail]
  B -- No --> C{False-positive applied risk?}
  C -- Yes --> X
  C -- No --> D{Stage 75 font gains preserved?}
  D -- No --> X
  D -- Yes --> E{Stage 78 p95/protected wins preserved?}
  E -- No --> X
  E -- Yes --> F[Allow commit/push]
```
