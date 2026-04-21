# Staged Proof-Driven Remediation Roadmap

This roadmap breaks the next engine direction into explicit stages and points back to the underlying change plan:

- primary change plan: [engine-and-grader-rebalance-plan.md](/home/hendo420/PDFAF_v2/docs/engine-and-grader-rebalance-plan.md)
- related v1 research summary: [v1-general-engine-lessons-for-v2.md](/home/hendo420/PDFAF_v2/docs/v1-general-engine-lessons-for-v2.md)

The intent is to move v2 from heuristic-heavy convergence toward **proof-driven structural remediation**, while keeping the hot path fast.

## Why This Should Be Staged

This is more than another corpus push.

It changes:

- how the fixer decides a mutation really succeeded
- how routes are defined and bounded
- how rollback decisions work
- how the grader weights structural blockers vs advisory quality issues

That is enough of a system change to justify a staged roadmap.

## Stage 35: Structural Invariants

### Goal

Make the engine stop calling structural mutations successful unless hard post-mutation checks pass.

### Scope

Implement invariant validators for:

- headings
- figures
- tables
- annotations/links

### Required outputs

Each relevant Python mutation should return enough facts to prove:

- target still resolves
- target is root-reachable where required
- role is valid after RoleMap resolution
- ownership/linkage is preserved
- table tree is structurally valid where claimed

### Engine change

Structural tools should return:

- `applied`
- `no_effect`
- `failed`

based on invariants, not just mutation occurrence.

### Why first

Do this before changing grader policy. The grader should not be rebalanced around unproven mutations.

### Success criteria

- fewer false-positive `applied` mutations
- fewer local “wins” that fail external structural reality
- no material runtime regression

## Stage 36: Structural Benefit Signals

### Goal

Make rollback and route continuation decisions depend on real structural improvements, not just weighted score deltas.

### Scope

Add explicit structural-benefit signals such as:

- heading reachability improved
- heading hierarchy improved
- figure ownership improved
- alt attached to reachable figure
- table validity improved
- annotation ownership improved
- reading-order depth improved

### Engine change

The orchestrator should preserve a stage when:

- score movement is neutral or slightly negative
- but structural benefit is clearly positive

### Why second

This builds directly on the invariant work and reduces destructive rollback before route contracts are tightened.

### Success criteria

- fewer harmful rollbacks
- better convergence on structurally difficult PDFs
- clearer audit trail for why a stage was kept

## Stage 37: Route Contracts

### Goal

Turn remediation routes into strict, bounded contracts instead of loose tool bundles.

### Scope

For each major route, define:

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

### Engine change

Planner and orchestrator should share the same route contract model.

### Why third

Once mutation truth and structural benefit are reliable, route logic can be tightened without hiding useful work.

### Success criteria

- less tool spillover
- lower retry noise
- lower p95 from fewer exploratory passes

## Stage 38: Failure-Profile Deepening

### Goal

Make routing more dependent on actual structural state and less dependent on broad failing-category logic.

### Scope

Add richer planner inputs:

- last stable `no_effect`
- retry disposition
- dominant residual class
- invariant failure reasons
- structural confidence state
- ownership integrity state

### Engine change

Use those signals to distinguish:

- heading absent vs heading malformed
- figure ownership broken vs alt missing
- malformed table tree vs missing headers
- annotation ownership broken vs weak link text
- minimal-tree outlier vs rich but inconsistent tree

### Why fourth

This is where the routing model becomes genuinely smarter without adding family-specific logic.

### Success criteria

- fewer unnecessary tool attempts
- cleaner route selection
- no name-based or family-based routing hacks

## Stage 39: Mutation Batching Expansion

### Goal

Reduce subprocess churn and unstable intermediate states by batching compatible structural work.

### Scope

Batch small ordered mutation bundles, such as:

- heading promotion + hierarchy normalization + conformance repair
- figure ownership normalization + targeted alt assignment
- table normalization + header assignment
- annotation ownership + link cleanup

### Engine change

Prefer:

- one Python open/apply/save cycle
- one reanalysis after the batch

over many tiny sequential cycles where safe.

### Why fifth

Batching should come after route contracts, otherwise the wrong things may get grouped.

### Success criteria

- lower mean/median remediation time
- fewer unstable intermediate states
- no loss of debuggability

## Stage 40: Grader Rebalance

### Goal

Make the grader stricter on true structural defects and less harsh on advisory/document-style heuristics.

### Scope

Adjust scoring to be:

- stricter on:
  - reachable heading absence
  - checker-visible figure ownership failure
  - alt attached to wrong node
  - invalid table trees
  - unowned visible annotations
  - over-credited shallow/minimal trees
- looser on:
  - heading density expectations
  - mild table advisory irregularity
  - style/document-shape heuristics that do not break accessibility

### Grading model

Split the model into:

- structural blockers
- semantic incompleteness
- advisory quality issues

Recommended scoring behavior:

- blockers cap hard
- incompleteness deducts moderately
- advisory issues deduct lightly

### Why sixth

Only change scoring after the fixer is more trustworthy. Otherwise the grader will be tuned around noisy or misleading mutation behavior.

### Success criteria

- fewer false harsh penalties on valid PDFs
- fewer false optimistic passes on structurally broken PDFs
- better alignment between score and actual accessibility value

## Stage 41: Benchmark and Review Gates

### Goal

Lock in speed and quality so the new architecture cannot silently drift.

### Scope

For every subsequent engine stage, track:

- mean / median / p95 runtime
- route activation counts
- `applied` / `no_effect` / `failed`
- rollback count
- invariant-failure count
- structural-benefit counts
- score deltas

### Canary policy

Maintain a fixed mixed canary set with:

- short tagged docs
- untagged digital docs
- partially tagged docs
- long reports
- figure-heavy docs
- malformed tables
- minimal-tree outliers

### Why last

This stage institutionalizes the new engine direction after the core truth/route/grade changes are in place.

### Success criteria

- speed remains bounded
- regressions become obvious quickly
- future engine changes are easier to evaluate

## Stage 42: Heading Recovery v2

### Goal

Lift the remaining D/F tail by solving the dominant blocker: multi-page PDFs with zero checker-visible headings after remediation.

### Current evidence

Accepted Stage 40 baseline:

- remediated corpus: `16 A / 9 B / 2 C / 4 D / 19 F`
- D/F tail: `23` files
- heading failures in D/F tail: `18`
- common failure shape: score capped near `59/F` because `heading_structure` remains `0`

### Scope

Add a bounded, deterministic heading-recovery lane for true zero-heading files:

- trigger only on multi-page PDFs with no checker-visible `H1-H6`
- use reachable paragraph structure, font/style clustering, page position, and repeated-title filtering
- promote only a small set of high-confidence heading candidates
- validate that root-reachable heading count increases after mutation
- preserve hierarchy sanity and avoid repeated-title spam

Do not add corpus-name rules, broad semantic/LLM routing, or global candidate retry budgets.

### Success criteria

- reduce Stage 40 D/F zero-heading files materially
- no increase in false-positive `applied`
- pass Stage 41 benchmark gate against the Stage 40 baseline
- keep p95 runtime within the Stage 41 gate envelope

## Stage 43: Table Normalization v2

### Goal

Move table-driven D files and table-capped F files upward after heading caps are reduced.

### Current evidence

Accepted Stage 40 D/F tail includes:

- `7` files with `table_markup < 70`
- repeated pattern: `table_markup = 35`
- current likely blocker: dense rowless or malformed table structures

### Scope

Improve deterministic table-local repair only:

- normalize malformed `Table -> TR -> TH/TD` structure
- repair rowless dense tables when row grouping is inferable
- keep pseudo-layout tables declassified rather than preserving broken semantics
- preserve Stage 35 invariant truth and Stage 41 gate discipline

Do not add whole-document table inference or expensive semantic table understanding.

### Success criteria

- current `69/D` table-capped files move to `C` or better when heading debt is not the blocker
- table validity improvements are invariant-backed
- no p95 runtime regression beyond Stage 41 gate tolerance

## Stage 44: Figure Ownership and Alt Recovery v2

### Goal

Address the remaining alt-driven D/F files after heading and table blockers are reduced.

### Current evidence

Accepted Stage 40 D/F tail includes:

- `8` files with `alt_text < 70`
- some files are still primarily heading-capped, so alt work should follow heading recovery

### Scope

Improve checker-visible figure ownership before alt assignment:

- preserve or increase reachable `/Figure` coverage
- move `/Alt` only onto reachable `/Figure` nodes
- keep `set_figure_alt_text` honest when ownership is still invalid
- keep semantic alt generation out of the mandatory path

### Success criteria

- alt-driven F files move up without fake `/Alt` wins
- no loss of checker-visible figure ownership
- Stage 41 gate passes after full-corpus benchmark

## Recommended Order

1. Stage 35: Structural Invariants
2. Stage 36: Structural Benefit Signals
3. Stage 37: Route Contracts
4. Stage 38: Failure-Profile Deepening
5. Stage 39: Mutation Batching Expansion
6. Stage 40: Grader Rebalance
7. Stage 41: Benchmark and Review Gates
8. Stage 42: Heading Recovery v2
9. Stage 43: Table Normalization v2
10. Stage 44: Figure Ownership and Alt Recovery v2

## Why This Order

- first make mutation truth reliable
- then preserve real structural progress
- then tighten routing
- then make routing smarter
- then optimize performance with batching
- then tune the grader around a more trustworthy fixer
- then lock in measurement and review discipline
- then attack the biggest accepted D/F blocker first: zero checker-visible headings
- then repair table structure once heading caps stop masking table wins
- then recover figure ownership and alt after structural navigation blockers are reduced

## Fast-Path Guardrails

These stages should not make v2 slow by default.

Hard rules:

- no broad semantic/LLM default path
- no new global deep inspection pass
- invariant checks only after structural mutations
- deep inspection remains conditional
- retries stay hard-capped
- batching must reduce total process churn

## Working Rule For This Roadmap

When implementing these stages, always refer back to:

- [engine-and-grader-rebalance-plan.md](/home/hendo420/PDFAF_v2/docs/engine-and-grader-rebalance-plan.md)

That document is the detailed change plan.
This roadmap is the execution order and staging structure.
