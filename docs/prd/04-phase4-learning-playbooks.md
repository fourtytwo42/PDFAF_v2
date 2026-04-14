# Phase 4 — Learning & Playbooks
## Adaptive Fast Path via Failure Signature Caching

**Prerequisite:** Phase 3 complete and passing.

**Goal:** The system learns from successful remediations. When a PDF with a **matching abstract failure signature** is submitted, it replays the previously successful tool sequence instead of running the full discovery loop. This speeds up **any** recurring document pattern (same template, same authoring tool chain) — ICJIA is one validation corpus, not a hardcoded customer in code.

**Generalization:** Playbook keys must **never** be publication ids, file paths, or customer names. Only **deterministic hashes** of portable fields (see `FailureSignature` below). Same rules as Phase 2 (`docs/prd/02-phase2-deterministic-remediation.md` — Generalization section).

**Completion criteria:** Second submission of a previously-remediated document type completes in < 5s. `GET /v1/playbooks` returns the learned catalog.

---

## What Gets Built

```
src/
├── services/
│   └── learning/
│       ├── playbookStore.ts      # NEW
│       ├── toolOutcomes.ts       # NEW
│       └── failureSignature.ts   # NEW
├── db/
│   └── schema.ts                 # UPDATED — add playbooks + tool_outcomes tables
tests/
├── learning/
│   ├── playbookStore.test.ts     # NEW
│   ├── toolOutcomes.test.ts      # NEW
│   └── failureSignature.test.ts  # NEW
```

---

## Core Concepts

### Failure Signature

A fingerprint of the document's accessibility failure state. Two PDFs with the same signature will likely benefit from the same remediation sequence.

```typescript
export interface FailureSignature {
  pdfClass: PdfClass
  failingCategories: CategoryId[]         // sorted alphabetically
  isScanned: boolean
  hasStructureTree: boolean
  estimatedPageRange: '1-5' | '6-20' | '21-50' | '50+'
}

export function buildFailureSignature(analysis: AnalysisResult): string {
  // Returns a stable SHA-256 hash of the signature object
  // Sorted keys ensure hash is deterministic regardless of insertion order
  const sig: FailureSignature = {
    pdfClass: analysis.pdfClass,
    failingCategories: analysis.categories
      .filter(c => c.applicable && c.score < 90)
      .map(c => c.id)
      .sort(),
    isScanned: analysis.isScanned,
    hasStructureTree: analysis.hasStructureTree,
    estimatedPageRange: classifyPageCount(analysis.pageCount),
  }
  return createHash('sha256').update(JSON.stringify(sig)).digest('hex').slice(0, 16)
}
```

**Why include page range:** Font embedding and structure bootstrap complexity scales with page count. A 5-page doc and a 50-page doc with the same failure categories may need different tool strategies.

**Why NOT include:** exact score, exact filename, page count (only range), font names. These make signatures too specific, preventing cache hits.

### Playbook

A stored, validated tool sequence for a given failure signature.

```typescript
export interface Playbook {
  id: string                    // UUID
  failureSignature: string      // 16-char hash
  pdfClass: string              // for display/debugging
  toolSequence: PlaybookStep[]  // ordered tool calls
  successCount: number
  attemptCount: number
  avgScoreImprovement: number   // running average
  status: 'candidate' | 'active' | 'retired'
  createdAt: string
  lastUsedAt: string | null
}

export interface PlaybookStep {
  stage: number
  toolName: string
  params: Record<string, unknown>   // sanitized: no figure-specific IDs (those change per doc)
}
```

**Status lifecycle:**
- `candidate` — fewer than 3 successful uses (not yet trusted for fast path)
- `active` — 3+ successful uses AND success rate ≥ 60%
- `retired` — success rate dropped below 40% over last 10 attempts (demoted)

**Note:** Playbooks store tool names and stage-level params (e.g. "set language to en-US"), NOT figure-specific IDs or document-specific strings. Document-specific data (alt text proposals, heading text) comes fresh from each remediation.

### Tool Outcomes

Per-tool success tracking by PDF class. Used to filter low-reliability tools from the planner.

```typescript
export interface ToolOutcome {
  toolName: string
  pdfClass: PdfClass
  outcome: 'applied' | 'no_effect' | 'rejected' | 'failed'
  scoreBefore: number
  scoreAfter: number
  createdAt: string
}

export interface ToolReliability {
  toolName: string
  pdfClass: PdfClass
  attempts: number
  successRate: number     // fraction of 'applied' outcomes
  avgScoreDelta: number   // average score change when applied
}
```

---

## Database Schema Update

```sql
-- Add to schema.ts

CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  failure_signature TEXT NOT NULL,
  pdf_class TEXT NOT NULL,
  tool_sequence TEXT NOT NULL,     -- JSON: PlaybookStep[]
  success_count INTEGER DEFAULT 0,
  attempt_count INTEGER DEFAULT 0,
  avg_score_improvement REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS playbooks_signature ON playbooks(failure_signature);

CREATE TABLE IF NOT EXISTS tool_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name TEXT NOT NULL,
  pdf_class TEXT NOT NULL,
  outcome TEXT NOT NULL,
  score_before REAL NOT NULL,
  score_after REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tool_outcomes_lookup ON tool_outcomes(tool_name, pdf_class);
```

---

## File Specs

### `src/services/learning/failureSignature.ts`

```typescript
export function buildFailureSignature(analysis: AnalysisResult): string
export function describeSignature(analysis: AnalysisResult): FailureSignature
```

Simple, pure functions. No I/O.

### `src/services/learning/playbookStore.ts`

```typescript
export interface PlaybookStore {
  // Find a playbook for this signature, returns null if none active
  findActive(signature: string): Playbook | null

  // Record the start of a playbook attempt
  recordAttempt(signature: string, toolSequence: PlaybookStep[], pdfClass: string): string  // returns attempt id

  // Record the result of an attempt
  recordResult(playbookId: string, success: boolean, scoreImprovement: number): void

  // Learn from a successful remediation (creates or updates playbook)
  learnFromSuccess(
    analysis: AnalysisResult,
    appliedTools: AppliedTool[],
    scoreImprovement: number
  ): void

  // Get all playbooks for display
  listAll(): Playbook[]

  // Get reliability summary for a tool + class combo
  getReliability(toolName: string, pdfClass: PdfClass): ToolReliability | null
}

export function createPlaybookStore(db: Database): PlaybookStore
```

**`learnFromSuccess` logic:**
1. Build failure signature from `analysis`
2. Sanitize `appliedTools` → `PlaybookStep[]` (strip figure-specific IDs, keep tool names + stage-level params)
3. Upsert playbook: if signature exists, update success_count + avg_score_improvement; if new, insert as `candidate`
4. Promote to `active` if successCount >= 3 AND successRate >= 0.6
5. Retire if successRate < 0.4 over last 10 attempts

**`findActive` logic:**
1. Look up by signature hash
2. If found and status = `active`, return it
3. Otherwise return null (run full discovery loop)

### `src/services/learning/toolOutcomes.ts`

```typescript
export interface ToolOutcomeStore {
  record(outcome: Omit<ToolOutcome, 'id' | 'createdAt'>): void
  getReliability(toolName: string, pdfClass: PdfClass): ToolReliability
  getReliabilitySummary(): ToolReliability[]
}

export function createToolOutcomeStore(db: Database): ToolOutcomeStore
```

**`getReliability` logic:**
- Query last 20 outcomes for toolName + pdfClass (recency bias)
- Compute successRate = count(outcome='applied') / total
- Compute avgScoreDelta = avg(score_after - score_before) where outcome='applied'
- If attempts < 3: return `{ successRate: 0.85, attempts: 0 }` (optimistic default)

---

## Orchestrator Integration (Updates to Phase 2 Code)

The orchestrator is updated to:
1. Check for active playbook before starting the loop
2. Record outcomes after each tool execution
3. Learn from successful remediations after the loop

```typescript
// In orchestrator.ts
export async function remediatePdf(
  buffer: Buffer,
  filename: string,
  initialAnalysis: AnalysisResult,
  options?: RemediationOptions
): Promise<RemediationResult> {

  const signature = buildFailureSignature(initialAnalysis)
  
  // 1. Check playbook fast path
  const playbook = playbookStore.findActive(signature)
  if (playbook) {
    const result = await executePlaybook(buffer, filename, initialAnalysis, playbook)
    if (result.improved) {
      playbookStore.recordResult(playbook.id, true, result.after.score - result.before.score)
      return result
    }
    // Playbook failed — fall through to full loop
    playbookStore.recordResult(playbook.id, false, 0)
  }

  // 2. Full discovery loop (existing Phase 2 logic)
  const result = await runFullLoop(buffer, filename, initialAnalysis, options)

  // 3. Learn from success
  if (result.improved && result.after.score > result.before.score + 5) {
    playbookStore.learnFromSuccess(initialAnalysis, result.appliedTools, result.after.score - result.before.score)
  }

  // 4. Record tool outcomes
  for (const tool of result.appliedTools) {
    toolOutcomeStore.record({
      toolName: tool.toolName,
      pdfClass: initialAnalysis.pdfClass,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
    })
  }

  return result
}
```

### Planner Integration (Updates to Phase 2 Code)

The planner uses tool reliability to avoid repeatedly trying ineffective tools:

```typescript
// In planner.ts
function filterByReliability(
  tools: PlannedTool[],
  pdfClass: PdfClass,
  alreadyAttempted: AppliedTool[]
): PlannedTool[] {
  return tools.filter(tool => {
    const reliability = toolOutcomeStore.getReliability(tool.toolName, pdfClass)
    // Skip tools with very low success rate (only after sufficient data)
    if (reliability.attempts >= 10 && reliability.successRate < 0.2) {
      return false
    }
    return true
  })
}
```

---

## `GET /v1/playbooks` Endpoint

```typescript
// GET /v1/playbooks
// Returns:
{
  playbooks: Array<{
    id: string
    failureSignature: string
    pdfClass: string
    toolCount: number
    successCount: number
    attemptCount: number
    successRate: number
    avgScoreImprovement: number
    status: 'candidate' | 'active' | 'retired'
    lastUsedAt: string | null
  }>
  toolReliability: Array<{
    toolName: string
    pdfClass: string
    attempts: number
    successRate: number
    avgScoreDelta: number
  }>
}
```

---

## Playbook Execution

When a playbook is found, execute its stored tool sequence without running the full planner:

```typescript
async function executePlaybook(
  buffer: Buffer,
  filename: string,
  analysis: AnalysisResult,
  playbook: Playbook
): Promise<RemediationResult> {
  
  let currentBuffer = buffer
  let currentAnalysis = analysis
  const appliedTools: AppliedTool[] = []

  // Group steps by stage
  const byStage = groupBy(playbook.toolSequence, s => s.stage)

  for (const [stageNum, steps] of Object.entries(byStage)) {
    const mutations = steps.map(step => ({
      op: step.toolName,
      params: step.params
    }))
    
    const { buffer: newBuffer } = await runPythonMutationBatch(currentBuffer, mutations)
    const newAnalysis = await analyzePdf(newBuffer, filename, { profile: 'fast' })
    
    if (newAnalysis.score >= currentAnalysis.score - 1) {
      currentBuffer = newBuffer
      currentAnalysis = newAnalysis
    }
    // If stage regressed, skip it (don't revert others)
    
    if (currentAnalysis.score >= (options?.targetScore ?? 90)) break
  }

  return {
    before: analysis,
    after: currentAnalysis,
    remediatedBuffer: currentBuffer,
    appliedTools,
    rounds: [{ round: 0, source: 'playbook', scoreAfter: currentAnalysis.score }],
    totalMs: 0,
    improved: currentAnalysis.score > analysis.score,
  }
}
```

---

## Tests

### `tests/learning/failureSignature.test.ts`
- Two analyses with same failing categories produce same signature
- Different page ranges produce different signatures
- Different pdf classes produce different signatures
- Order of failing categories doesn't affect signature (sorted)

### `tests/learning/playbookStore.test.ts`
- `findActive` returns null for unknown signatures
- `learnFromSuccess` creates candidate playbook
- After 3 successes, status becomes `active`
- After 10+ attempts with <40% success rate, status becomes `retired`
- `findActive` returns null for retired playbooks

### `tests/learning/toolOutcomes.test.ts`
- `getReliability` returns 0.85 default for unknown tools (< 3 attempts)
- After 10+ outcomes, returns actual success rate
- `getReliabilitySummary` returns all tools with data

### Integration test
- Remediate same PDF twice
- Second remediation: playbook found, executes faster
- Assert `rounds[0].source === 'playbook'` on second run

---

## Definition of Done (Phase 4)

- [ ] Second run of previously-remediated document type uses playbook fast path
- [ ] Playbook fast path completes in < 5s for a 20-page PDF
- [ ] `GET /v1/playbooks` returns catalog with success rates
- [ ] Low-reliability tools are filtered out by planner after 10+ attempts
- [ ] Playbooks are persisted across server restarts (SQLite)
- [ ] Playbook status lifecycle works (candidate → active → retired)
- [ ] All Phase 1, 2, 3 tests still pass
- [ ] `pnpm test` passes all tests
