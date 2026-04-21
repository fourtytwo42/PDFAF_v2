# Engine and Grader Rebalance Plan

## Summary

The next major improvement should not be another corpus-specific push. It should be a general engine upgrade with two goals:

1. make remediation more **proof-driven**
2. make grading more **structurally correct and less heuristic-heavy**

The core direction is:

- stricter after-mutation validation
- cleaner route contracts
- stronger structural-benefit signals
- more batching
- grader that is stricter on broken semantics and looser on advisory/style heuristics

This should improve more PDFs generally while keeping the hot path fast.

## Stage 1: Add Structural Invariant Validators

### Goal

Stop treating mutations as successful unless they satisfy hard structural checks.

### Implement

Add invariant validators for the main accessibility surfaces:

- headings
  - reachable from `/StructTreeRoot`
  - valid heading role after RoleMap resolution
  - valid parent chain
  - exactly one `H1` when applicable
- figures
  - target node still resolves
  - target node is reachable
  - target node role is `/Figure` after RoleMap resolution
  - `/Alt` is present on that node
  - figure ownership count does not collapse after normalization
- tables
  - `Table -> TR -> TH/TD`
  - no direct `TH/TD` under `Table`
  - valid header presence when claimed
- annotations/links
  - visible annotations have valid ownership
  - `StructParent` linkage is preserved
  - reachable annotation structure remains intact

### Behavior change

For structural tools, `applied` should require invariant success.
Otherwise return:

- `no_effect`
- or `failed` with a precise reason

### Where to wire it

- Python mutator returns explicit validation facts
- Node orchestrator uses them to accept/reject stage results

### Acceptance

- fewer false-positive `applied` results
- fewer regressions where local score improves but structural truth does not
- no meaningful runtime regression from validators

## Stage 2: Formalize Route Contracts

### Goal

Make each remediation route deterministic, bounded, and auditable.

### Implement

For every route, define:

- trigger conditions
- allowed tools
- prohibited tools
- success proof
- failure proof
- retry cap
- exit condition

Priority routes:

- structure bootstrap
- zero-heading convergence
- figure ownership then alt assignment
- table normalization
- annotation/link ownership cleanup
- font/extractability tail

### Why

Right now some routes are still “likely tool bundles.”
They should become contracts.

### Acceptance

- route behavior is easier to reason about
- less tool spillover across unrelated debts
- lower p95 from fewer exploratory retries

## Stage 3: Introduce First-Class Structural Benefit Signals

### Goal

Stop using score delta as the main proxy for whether a mutation was worth keeping.

### Implement

Add typed structural-benefit outputs such as:

- `headingReachabilityImproved`
- `headingHierarchyImproved`
- `figureOwnershipImproved`
- `figureAltAttachedToReachableFigure`
- `tableValidityImproved`
- `annotationOwnershipImproved`
- `readingOrderDepthImproved`

These should be emitted by the Python layer and consumed by the orchestrator.

### Behavior change

Rollback policy becomes:

- reject obvious regressions
- preserve real structural improvements even if weighted score is flat or slightly down

### Acceptance

- fewer destructive rollbacks
- better convergence on hard structural PDFs
- cleaner audit trail for why a stage was kept

## Stage 4: Batch More Structural Mutations

### Goal

Reduce subprocess churn and unstable intermediate states.

### Implement

Batch compatible structural operations into one Python call where ordering is safe.

Good batch candidates:

- heading promotion + hierarchy normalization + conformance repair
- figure ownership normalization + targeted alt assignment
- table normalization + header assignment
- annotation ownership + link contents normalization

### Rules

- keep batches small and ordered
- reanalyze once after the batch
- do not batch speculative unrelated tools

### Acceptance

- lower mean and median remediation time
- no increase in mutation ambiguity
- reduced “half-fixed intermediate” states

## Stage 5: Deepen Failure-Profile Routing

### Goal

Make routing depend more on actual structural state and less on category-only failure.

### Implement

Expand failure-profile inputs with:

- last stable `no_effect` tool
- retry disposition
- dominant residual class
- invariant failure reasons
- structural confidence state
- ownership integrity state

Use those to distinguish:

- heading absent vs heading malformed
- figure ownership broken vs alt missing
- malformed table tree vs missing headers
- annotation ownership broken vs weak visible link text
- shallow/minimal tree vs rich but inconsistent tree

### Acceptance

- fewer unnecessary tool attempts
- better planning precision
- no family/name-specific logic required

## Stage 6: Rebalance the Grader

### Goal

Make grading stricter on true structural defects and less harsh on advisory/document-style heuristics.

## Regrading Direction

### Be stricter on hard semantic defects

Increase strictness when:

- reachable heading semantics are absent
- figure ownership is not checker-visible
- `/Alt` is not attached to the readable figure node
- table tree is structurally invalid
- visible annotations are not structurally owned
- shallow/minimal trees are being over-credited

These should drive:

- hard caps
- stronger deductions
- clearer findings

### Be less strict on advisory heuristics

Reduce penalty weight for:

- heading density expectations
- mild table advisory irregularity
- document-style assumptions that do not block accessibility
- non-critical quality deductions on otherwise valid structure

### Grading model change

Split category deductions into:

- structural blockers
- semantic incompleteness
- advisory quality issues

Recommended model:

- blocker defects cap hard
- semantic incompleteness deducts moderately
- advisory quality deducts lightly

### Likely category adjustments

- `heading_structure`
  - keep strict on zero reachable headings, multiple `H1`, unreachable headings
  - soften density penalty
- `alt_text`
  - keep strict on missing reachable figure ownership and missing alt
  - soften weak-alt phrasing deductions relative to ownership failures
- `table_markup`
  - keep strict on invalid table tree
  - soften mild regularity-only penalties
- `link_quality`
  - keep strict on missing structural ownership
  - keep weak-label cleanup as secondary

### Acceptance

- scores better reflect actual assistive-technology impact
- fewer false harsh penalties on valid-but-imperfect PDFs
- fewer false optimistic passes on structurally broken PDFs

## Stage 7: Add Benchmark and Review Gates For Engine Work

### Goal

Make sure engine improvements remain fast and broadly useful.

### For every stage, measure

- local mean / median / p95 runtime
- tool-attempt count per route
- `applied` vs `no_effect` vs `failed`
- rollback count
- invariant-failure count
- score deltas
- structural-benefit counts

### Canary sets

Use a fixed general canary set that includes:

- short tagged docs
- untagged digital docs
- partially tagged docs
- long reports
- figure-heavy docs
- malformed table docs
- minimal-tree outliers

Not family-specific routing, just a balanced benchmark set.

## Recommended Implementation Order

### Phase A

- Stage 1: structural invariant validators
- Stage 3: structural-benefit signals

### Phase B

- Stage 2: route contracts
- Stage 5: deeper failure-profile routing

### Phase C

- Stage 4: more structural batching

### Phase D

- Stage 6: grader rebalance

### Phase E

- Stage 7: permanent benchmark gates

## Why this order

- first make the engine more truthful
- then make routing cleaner
- then make it faster
- then tune scoring around stronger semantics
- then lock in the benchmark discipline

## Fast-path Guardrails

To keep the engine fast:

- no new broad semantic/LLM default path
- no new global deep inspection pass
- invariant checks should run only after structural mutations
- deep inspection should remain conditional
- route retries remain hard-capped
- batching should reduce total process churn, not add stages

## Expected Outcome

If implemented well, this should produce:

- fewer fake successes
- fewer rollback mistakes
- better generalization across PDFs
- better speed under repeated remediation
- grading that better matches real accessibility value

The overall shift is:

- from heuristic-heavy convergence
- to proof-driven structural remediation

That is the right next step for maturing v2.
