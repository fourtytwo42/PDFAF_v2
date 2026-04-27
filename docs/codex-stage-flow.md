# Codex Stage Automation Flow

```mermaid
flowchart TD
  A[User starts runner] --> B[Runner creates Output/agent-runs stage folder]
  B --> C[Discover corpus state: legacy runs, protected baseline, v1 holdouts]
  C --> D[Render coordinator prompt from docs/agent-prompts plus corpus-loop policy]
  D --> E[Record metadata and local LLM/listener status]
  E --> F[Launch codex exec worker]
  F --> G[Stream readable progress to terminal and log]
  G --> H[Worker establishes current baseline on legacy plus active holdout]
  H --> I{Stable general fix candidate?}
  I -- No --> J[Classify debt: analyzer volatility, manual policy, runtime, parked]
  J --> K{Holdout plateau?}
  K -- Yes --> L[Select or build next v1 holdout batch]
  K -- No --> M[Write diagnostic report]
  I -- Yes --> N[Make one narrow source change]
  N --> O[Validate target holdout and legacy protected corpus]
  L --> P[Write structured summary JSON]
  M --> P
  O --> Q{Quality/speed/purity preserved?}
  Q -- No --> R[Reject, tighten, or revert candidate]
  Q -- Yes --> S[Commit and push source/docs/tests only]
  R --> P
  S --> P
  P --> T{Continuous mode stop reason?}
  T -- blocked/rejected/acceptance_ready/safe_to_implement --> U[Stop for human decision]
  T -- diagnostic_only/implemented --> V[Increment stage number]
  V --> B
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
  Runner->>Runner: discover legacy baseline and v1 holdout state
  Runner->>Codex: coordinator prompt + corpus-loop policy + output schema
  Codex->>Repo: inspect AGENTS/docs/scripts
  Codex->>Bench: run or inspect current legacy and holdout baselines
  Codex->>Bench: classify stable failures vs parked debt
  Codex->>Repo: add one narrow fixer or diagnostic source/doc
  Codex->>Bench: validate target holdout, legacy corpus, and visual stability
  Codex->>Repo: commit and push source/doc only
  Codex->>Runner: structured stage decision
  Runner->>Runner: decide continue or stop
```

## Corpus Evolution Loop

```mermaid
flowchart LR
  A[Current engine] --> B[Legacy protected corpus baseline]
  A --> C[Active v1 holdout batch]
  C --> D[Classify residual families]
  D --> E{Stable safe fixer?}
  E -- Yes --> F[Implement one narrow general rule]
  F --> G[Validate holdout improvement]
  F --> H[Validate legacy non-regression]
  G --> I{Both pass?}
  H --> I
  I -- Yes --> J[Commit and continue]
  I -- No --> K[Tighten or revert]
  E -- No --> L{Holdout plateau?}
  L -- Yes --> M[Pull/select next v1 holdout]
  L -- No --> N[Run focused diagnostics]
  J --> D
  K --> D
  M --> C
  N --> D
```

## Stage Checklist

1. **Preflight:** git state, disk, local LLM/listeners, protected baseline, active holdout, latest artifacts.
2. **Baseline:** current legacy 50 plus active v1 holdout metrics.
3. **Classify:** stable fix candidates vs analyzer volatility, manual/OCR policy debt, runtime tail, protected parity debt, controls.
4. **Select:** one stable general family, or declare plateau and select/build a new v1 holdout.
5. **Diagnose:** smallest target sample with controls, timelines, category deltas, raw evidence, and visual-risk signals.
6. **Decide:** implement only with a proven safe general rule; otherwise park and report.
7. **Implement:** one narrow criterion-driven change with tests, no filename/corpus-specific logic.
8. **Focused Validate:** static/unit tests, target rows, controls, visual diff when needed.
9. **Holdout Validate:** active v1 holdout or justified subset, with previous holdout wins preserved.
10. **Legacy Validate:** protected legacy validation and Stage 41 gate for behavior changes when feasible.
11. **Commit Or Reject:** source/docs/tests only, generated artifacts remain local.
12. **Summarize:** evidence, commands, artifacts, gates, remaining debt, next stage.

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
  E -- Yes --> F{Holdout target improved or debt classified?}
  F -- No --> X
  F -- Yes --> G{Legacy protected corpus non-regressed?}
  G -- No --> X
  G -- Yes --> H[Allow commit/push]
```
