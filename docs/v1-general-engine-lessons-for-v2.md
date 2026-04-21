# V1 Lessons Worth Porting Into V2

This note is a research summary for improving the **general PDFAF v2 remediation engine** using what v1 already learned at scale.

Scope:
- focus on **engine design**, not the current 50-file legal corpus
- prefer lessons that help **many PDFs in the future**
- avoid file-family naming tricks, keyword routing, or corpus-specific hacks
- keep remediation **fast by default**

Primary v1 sources:
- sibling repo root: `/home/hendo420/pdfaf`
- long-form operating log: `/home/hendo420/pdfaf/MEMORY.md`
- v1 remediation code map: `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v1-remediation-implementation-survey.md`
- distilled v1 memory lessons: `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/learnings-from-v1-memory.md`
- v2 opportunity summary already extracted from v1: `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`
- generalized remediation planning docs:
  - `/home/hendo420/pdfaf/docs/11-adobe-alignment-and-generalized-remediation-plan.md`
  - `/home/hendo420/pdfaf/docs/12-icjia-corpus-and-general-api-roadmap.md`

## Executive Summary

The biggest portable lessons from v1 are not its named campaign lanes. The best reusable lessons are:

1. **One authoritative final-byte analysis**
2. **Structure-first deterministic ordering**
3. **Failure-profile routing instead of broad category guesses**
4. **Cheap inspection by default, deeper inspection only when needed**
5. **Batched Python mutation for structural work**
6. **Tool outcome memory: `applied`, `no_effect`, `failed`, reliability**
7. **Bounded retries with plateau detection**
8. **Separate promotion gates from raw scores**
9. **Narrow, residual-only heavy cleanup lanes**
10. **Benchmark and progress infrastructure that scales without polluting the hot path**

If v2 copies those patterns, it should improve more PDFs generally while staying fast. If it copies v1’s lane explosion, campaign complexity, or manual-wave logic too early, it will get slower and harder to reason about.

## What V1 Proved That Still Matters

### 1. Final decisions must use one authoritative analysis on the final bytes

This is the most important lesson.

V1 repeatedly learned that a faster intermediate profile could say a file looked fixed while a stricter final profile disagreed. That created false passes and bad promotion decisions.

What to copy into v2:
- always make the final keep/drop or pass/fail decision from a **single strict analysis profile**
- run that profile on the **actual saved output bytes**
- if fast/intermediate analysis exists, treat it as a planner hint only

Where to find it in v1:
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `full_final`, `remediation_fast`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/learnings-from-v1-memory.md`
- `/home/hendo420/pdfaf/apps/api/src/services/agentRemediationService.ts`
- `/home/hendo420/pdfaf/apps/api/src/engine/index.ts`

Why it helps v2 generally:
- prevents false convergence
- makes regressions easier to reason about
- avoids optimizing the engine toward an internal shortcut that does not reflect shipped output

Why it stays fast:
- keep intermediate analyses for planning
- only the final decision needs the strict full profile

### 2. Structure must be repaired before heavy figure/alt work

V1 learned this the hard way on large PDFs. If the structure tree is still broken or missing, figure ownership and alt tools often do the wrong thing, appear to do nothing, or create unstable results.

What to copy into v2:
- always put these classes first on structurally broken PDFs:
  - structure bootstrap
  - marked-content ref repair
  - structure conformance
  - heading normalization / reading-order cleanup as needed
- only then spend work on figure ownership and alt

Where to find it in v1:
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `pageCount ≤ 8`, `bootstrap_struct_tree`, `repair_structure_conformance`, `repair_native_marked_content_refs`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/learnings-from-v1-memory.md`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v1-remediation-implementation-survey.md`
- `/home/hendo420/pdfaf/apps/api/src/services/remediationPlanService.ts`

Why it helps v2 generally:
- fixes the prerequisite semantics many later tools depend on
- reduces fake `no_effect` outcomes from figure tools targeting broken structure
- improves both headings and figures without family-specific routing

Why it stays fast:
- structure-first is an ordering rule, not extra work on every file
- only activate deeper structure repair when analysis shows actual structure debt

### 3. Use failure-profile routing, not broad category routing

V1 gradually evolved from “category X failed, so run many X-ish tools” into richer failure-profile and residual-family reasoning. The important portable idea is not the named families; it is the **document-specific failure model**.

What to copy into v2:
- route based on a compact failure profile that answers:
  - what is the dominant remaining debt
  - which tools are actually applicable
  - which tools already returned `no_effect`
  - whether the document is safe to retry deterministically
- keep routing based on **observed structure and findings**, not filenames, publishers, or known corpus families

Where to find it in v1:
- `/home/hendo420/pdfaf/apps/api/src/services/failureProfileService.ts`
- `/home/hendo420/pdfaf/apps/api/src/services/remediationPlanService.ts`
- `/home/hendo420/pdfaf/apps/api/src/services/liveResidualFamilyDiagnosisService.ts`
- `/home/hendo420/pdfaf/apps/api/src/engine/index.ts`
- `/home/hendo420/pdfaf/docs/12-icjia-corpus-and-general-api-roadmap.md`

Useful v1 signals to emulate:
- `dominantResidualFamily`
- `retryDisposition`
- `lastStableNoEffectTool`
- `safeToRetry`
- auto-runnable tool opportunities

Why it helps v2 generally:
- lets the planner choose fewer, better tools
- prevents global over-application of expensive or risky passes
- reduces regressions from category-only overreach

Why it stays fast:
- most of the routing value comes from analysis already being done
- failure-profile decisions are cheaper than running more mutations

### 4. Use cheap inspect modes first, and only escalate inspection depth when necessary

V1 ended up with multiple inspect modes and caching because deep inspection on every pass was too expensive.

What to copy into v2:
- keep a default light inspection mode
- add deeper inspection only for targeted debts such as:
  - hard alt/figure ownership ambiguity
  - complex structure/MCID repair
  - maybe table normalization when the cheap model is inconclusive
- cache inspection artifacts across the same remediation run

Where to find it in v1:
- `/home/hendo420/pdfaf/apps/api/src/services/pdfRemediationTools.ts`
  search for: `inspectMode`, `alt_text_deep`, `inspectionResultCache`, `contextsByMode`
- `/home/hendo420/pdfaf/apps/api/src/services/pdfStructureBackend.ts`
  search for: `inspect`, `alt_text_deep`, `batch_mutate`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`

Why it helps v2 generally:
- makes broad remediation viable on larger PDFs
- avoids penalizing easy documents with deep figure/table inspection

Why it stays fast:
- inspection escalation is conditional
- per-run caching cuts repeated qpdf/pdfjs/python overhead

### 5. Batch structural mutations in one Python round-trip whenever order allows

One of v1’s most practical wins was reducing subprocess churn by batching related structural work into one Python session.

What to copy into v2:
- batch compatible structure mutations together:
  - open once
  - apply ordered mutations
  - save once
  - reanalyze once
- use this for small deterministic bundles, not giant speculative sequences

Where to find it in v1:
- `/home/hendo420/pdfaf/apps/api/src/services/pdfStructureBackend.ts`
  search for: `batch_mutate`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v1-remediation-implementation-survey.md`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`

Why it helps v2 generally:
- most structural tools already touch the same risky surface area
- batching reduces I/O, process startup, and repeated parsing costs

Why it stays fast:
- fewer Python launches
- fewer save/reload cycles
- fewer redundant analyses

### 6. Keep a persistent tool-outcome ledger and use it to suppress bad retries

V1 tracked whether tools actually worked by PDF class and whether they repeatedly returned `no_effect`.

What to copy into v2:
- store tool outcomes in a simple durable table:
  - tool name
  - structural class
  - outcome
  - score delta or finding delta
- use that ledger to:
  - suppress repeated `no_effect` retries within a run
  - bias the planner away from low-yield tools for similar document classes

Where to find it in v1:
- `/home/hendo420/pdfaf/apps/api/src/services/toolReliabilityService.ts`
- `/home/hendo420/pdfaf/apps/api/src/services/failureProfileService.ts`
  search for: `lastStableNoEffectTool`, `retryDisposition`
- `/home/hendo420/pdfaf/apps/api/src/services/remediationPlanService.ts`
  search for: `reliabilityByTool`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`

Why it helps v2 generally:
- turns engine behavior into evidence-driven planning
- improves many PDFs indirectly by reducing wasted tool calls

Why it stays fast:
- it cuts retries more than it adds overhead
- the ledger itself is cheap

### 7. Plateau detection is as important as tool selection

V1 got better when it stopped assuming more rounds meant more progress.

What to copy into v2:
- detect plateau based on:
  - no score movement
  - no blocking-finding shrink
  - repeated stable `no_effect`
  - no structural benefit
- stop or switch lanes when plateau is clear
- keep retry caps per tool and per document

Where to find it in v1:
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `plateau`, `tail`, `no_effect`, `retry`
- `/home/hendo420/pdfaf/apps/api/src/services/failureProfileService.ts`
- `/home/hendo420/pdfaf/apps/api/src/services/remediationPlanService.ts`

Why it helps v2 generally:
- avoids spending time on dead-end loops
- forces the engine toward honest terminal states

Why it stays fast:
- plateau logic is a runtime saver, not a runtime cost

### 8. Separate the promotion gate from the raw score

V1 used explicit promotion rules instead of trusting score alone.

What to copy into v2:
- keep a separate policy object for “good enough to ship”
- include:
  - score threshold
  - scanned/manual-review constraints
  - critical blocker constraints
  - visual-preservation risk
- expose gate reasons in output

Where to find it in v1:
- `/home/hendo420/pdfaf/apps/api/src/services/promotionGate.ts`
- `/home/hendo420/pdfaf/apps/api/src/engine/index.ts`
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `evaluatePromotionGate`, `visualPreservation`, `manual review`

Why it helps v2 generally:
- score alone is too blunt for many PDFs
- lets the engine keep beneficial structural changes even when weighted scoring is temporarily noisy

Why it stays fast:
- gate evaluation is cheap
- it prevents unnecessary rollback/retry churn

### 9. Preserve checker-facing structural wins even when score movement is weak

This is one of the best v1 lessons for structural work.

What to copy into v2:
- if a mutation improves important structural truth, do not auto-revert it only because weighted score barely moved
- candidate structural wins:
  - heading count or reachability improved
  - visible annotation ownership improved
  - figure ownership became checker-visible
  - table structure became more valid

Where to find it in v1:
- conceptually throughout `/home/hendo420/pdfaf/MEMORY.md`
- `/home/hendo420/pdfaf/docs/11-adobe-alignment-and-generalized-remediation-plan.md`
- `/home/hendo420/pdfaf/apps/api/src/services/promotionGate.ts`
- `/home/hendo420/pdfaf/apps/api/src/services/failureProfileService.ts`

Why it helps v2 generally:
- reduces rollback of meaningful semantic repairs
- improves convergence on structurally broken PDFs

Why it stays fast:
- fewer destructive revert/retry cycles

### 10. Use narrow residual cleanup lanes only after the main deterministic path plateaus

V1 eventually added targeted residual passes, especially for figures. The lesson is not to start with heavy specialist lanes, but to have them as **late, narrow, bounded cleanup**.

What to copy into v2:
- keep the default path simple and deterministic
- add special cleanup only when:
  - the file is already near-pass or high-value
  - a specific residual family remains
  - the cleanup lane is bounded

Where to find it in v1:
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `targeted figure finalization`, `native_figure_convergence`, `final-mile`
- `/home/hendo420/pdfaf/apps/api/src/services/targetedFigureFinalizationService.ts`
- `/home/hendo420/pdfaf/apps/api/src/scripts/figureFinalization.ts`

Why it helps v2 generally:
- lets the engine recover hard residuals without making the hot path heavy for every document

Why it stays fast:
- these lanes only run on the residual tail

### 11. Build benchmarking and resumability into the system, but keep them out of the hot path

V1’s scale work around manifests, resumable progress, canaries, and explicit outcome bands was operationally valuable.

What to copy into v2:
- stable benchmark manifests
- resumable campaign progress
- explicit outcome bands
- per-stage timing
- canary sets per structural class

Where to find it in v1:
- `/home/hendo420/pdfaf/MEMORY.md`
  search for: `manifest`, `progress`, `ETA`, `outcomes`, `canary`
- `/home/hendo420/pdfaf/docs/12-icjia-corpus-and-general-api-roadmap.md`
- `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`

Why it helps v2 generally:
- lets you improve the engine using evidence rather than anecdotes
- supports future 1000-PDF scale without changing core remediation logic

Why it stays fast:
- this is control-plane infrastructure, not per-document hot-path work

## What V2 Should Explicitly Not Copy Yet

### 1. Named lane explosion

V1 needed many named campaign lanes because it was operating a huge live corpus. That does not mean v2 should add many first-class route names into the engine.

Do not copy:
- corpus-specific waves
- title or keyword-based routing
- special handling encoded from specific document families

Instead:
- keep route selection criterion-driven from analysis/failure profile

### 2. Heavy visual or semantic work in the default path

V1 added visual review holds and heavier semantic cleanup where needed. Those are useful, but they should remain optional or late-stage in v2.

Do not copy as default:
- screenshot-heavy verification
- multimodal semantic passes on every file
- deep alt generation before ownership is sound

### 3. Monolithic orchestrator growth

One of the reasons v1 became powerful is also one of the reasons it became hard to reason about: too much lived in giant services.

Do not copy:
- one giant remediation service accumulating all planner, executor, residual, and metrics logic

Instead:
- keep v2 split into:
  - analyzer / snapshot
  - planner
  - executor / Python bridge
  - scorer
  - benchmark/control-plane

## Prioritized Backlog For V2

If the goal is to improve the engine generally while keeping it fast, the highest-value v1 imports are:

1. **Authoritative final-byte gate discipline**
2. **Inspection-mode escalation with caching**
3. **Batched Python mutation bundles**
4. **Durable tool-outcome ledger with `no_effect` suppression**
5. **Failure-profile driven routing and retry disposition**
6. **Structural-benefit keep-change policy**
7. **Promotion gate separate from score**
8. **Residual-only specialist cleanup lanes**

## Suggested Concrete V2 Implementation Order

### First
- add or harden a durable tool-outcome ledger
- expand planner inputs with:
  - last stable `no_effect`
  - retry disposition
  - dominant residual class
- keep the final decision on a strict final-byte analysis only

### Second
- batch compatible structure mutations into one Python call
- deepen inspection only when the failure profile justifies it
- cache inspection artifacts across the remediation run

### Third
- preserve checker-facing structural wins instead of reverting purely on local weighted score
- formalize promotion gates and expose reasons in output

### Fourth
- add narrow residual cleanup passes for hard tails only after the general path plateaus

## Best V1 Files To Read First

If someone new needs the shortest useful reading list, start here:

1. `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/learnings-from-v1-memory.md`
2. `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v1-remediation-implementation-survey.md`
3. `/home/hendo420/PDFAF_v2_stage0_baseline/docs/prd/v2-opportunities-from-v1.md`
4. `/home/hendo420/pdfaf/MEMORY.md`
5. `/home/hendo420/pdfaf/apps/api/src/services/remediationPlanService.ts`
6. `/home/hendo420/pdfaf/apps/api/src/services/failureProfileService.ts`
7. `/home/hendo420/pdfaf/apps/api/src/services/pdfRemediationTools.ts`
8. `/home/hendo420/pdfaf/apps/api/src/services/pdfStructureBackend.ts`
9. `/home/hendo420/pdfaf/apps/api/src/services/promotionGate.ts`
10. `/home/hendo420/pdfaf/apps/api/src/services/toolReliabilityService.ts`

## Bottom Line

The most valuable thing v1 can give v2 is not its corpus tactics. It is its **control logic**:

- analyze final bytes strictly
- route by real failure profile
- inspect cheaply first
- batch structural mutations
- remember what failed or had no effect
- stop on plateau
- preserve real structural wins
- keep heavy cleanup lanes narrow and late

That is the path most likely to improve the **general** v2 engine for future PDFs without making the default remediation loop slow.
