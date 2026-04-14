# Phase 3 — Semantic Remediation
## LLM-Assisted Alt Text & Heading Proposals

**Prerequisite:** Phase 2 complete and passing.

**Goal:** Use a vision-capable LLM to generate high-quality alt text for figures, and context-aware heading proposals for untagged text content. The semantic pass runs after deterministic repair and only if `semantic: true` is passed to `/v1/remediate`.

**Completion criteria:** Alt-text scores improve by ≥ 10 points on average for PDFs with unresolved figure findings, with no score regressions.

---

## What Gets Built

```
src/
├── services/
│   ├── semantic/
│   │   ├── semanticService.ts       # NEW — LLM batch calls
│   │   ├── domainDetector.ts        # NEW — detect doc type from text
│   │   └── openAiCompatClient.ts   # NEW — provider abstraction
│   └── layout/
│       └── layoutAnalyzer.ts        # NEW — multi-column/zone detection
tests/
├── semantic/
│   ├── semanticService.test.ts      # NEW
│   └── domainDetector.test.ts       # NEW
```

---

## New Concept: Domain Detection

Before calling the LLM, classify the document's domain. This directly informs alt text quality by making prompts specific.

```typescript
export type DocumentDomain =
  | 'legal'           // court docs, statutes, contracts
  | 'government'      // government reports, policy docs
  | 'medical'         // clinical, pharmaceutical
  | 'financial'       // charts, spreadsheets, balance sheets
  | 'technical'       // engineering, software, scientific
  | 'academic'        // research papers, studies
  | 'general'         // fallback

export function detectDomain(
  title: string | null,
  textSample: string   // first ~500 chars of extracted text
): DocumentDomain
```

**Detection method:** Keyword scoring (fast, no LLM needed):

```typescript
const DOMAIN_KEYWORDS: Record<DocumentDomain, string[]> = {
  legal: ['court', 'statute', 'plaintiff', 'defendant', 'jurisdiction', 'criminal', 'probation', 'sentencing'],
  government: ['agency', 'department', 'appropriations', 'fiscal year', 'grant', 'program', 'policy', 'illinois'],
  medical: ['patient', 'clinical', 'diagnosis', 'treatment', 'hospital', 'medication', 'pharmaceutical'],
  financial: ['revenue', 'expenditure', 'budget', 'quarterly', 'fiscal', 'balance sheet', 'profit', 'loss'],
  technical: ['algorithm', 'implementation', 'specification', 'architecture', 'protocol', 'API'],
  academic: ['abstract', 'methodology', 'hypothesis', 'conclusion', 'literature review', 'citation'],
}
```

Score each domain by keyword hits in title + text sample. Return highest-scoring domain (fallback: `general`).

---

## New Concept: Layout Pre-Pass

Before identifying heading and figure candidates for the LLM, run a fast layout analysis to understand the document structure. This improves candidate quality.

```typescript
export interface LayoutZone {
  type: 'header' | 'footer' | 'sidebar' | 'main' | 'caption' | 'unknown'
  pageNumber: number
  bbox: [x0: number, y0: number, x1: number, y1: number]
}

export interface LayoutAnalysis {
  isMultiColumn: boolean
  columnCount: number
  zones: LayoutZone[]
  captionCandidates: Array<{ text: string; pageNumber: number; bbox: number[] }>
}

export async function analyzeLayout(
  buffer: Buffer,
  maxPages?: number   // default 20
): Promise<LayoutAnalysis>
```

**Implementation (no external models needed):**
- Use pdfjs text items with position data
- Detect multi-column by: checking if text x-coordinates cluster into 2+ vertical bands across pages
- Identify headers/footers: text that repeats on multiple pages at same y position
- Identify captions: short text blocks immediately below images, matching patterns like "Figure N", "Chart N", "Table N"

**Why this helps:**
- Figure candidates in sidebars get different alt text prompts than main body figures
- Caption text becomes part of the alt text context (huge quality improvement)
- Header/footer text is excluded from heading candidates (avoids false positives)

---

## LLM Integration

### `src/services/semantic/openAiCompatClient.ts`

```typescript
export interface OpenAiCompatConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface OpenAiCompatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }  // data: URL or http

export async function callWithFallbacks(
  messages: OpenAiCompatMessage[],
  tools: ToolDefinition[],
  options?: { timeoutMs?: number; temperature?: number }
): Promise<ToolCallResult>
```

**Config from environment:**
```typescript
function getEndpoints(): OpenAiCompatConfig[] {
  const configs: OpenAiCompatConfig[] = []
  if (process.env.OPENAI_COMPAT_BASE_URL) {
    configs.push({
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL,
      apiKey: process.env.OPENAI_COMPAT_API_KEY ?? '',
      model: process.env.OPENAI_COMPAT_MODEL ?? 'gpt-4o',
    })
  }
  if (process.env.OPENAI_COMPAT_FALLBACK_BASE_URL) {
    configs.push({
      baseUrl: process.env.OPENAI_COMPAT_FALLBACK_BASE_URL,
      apiKey: process.env.OPENAI_COMPAT_FALLBACK_API_KEY ?? '',
      model: process.env.OPENAI_COMPAT_FALLBACK_MODEL ?? 'gpt-4o',
    })
  }
  return configs
}
```

Try primary endpoint → on failure/timeout → try fallback. Throw if both fail.

### `src/services/semantic/semanticService.ts`

The main semantic repair service. Called after deterministic repairs, operates on the already-improved PDF.

```typescript
export interface SemanticRepairInput {
  buffer: Buffer
  filename: string
  analysis: AnalysisResult
  layout: LayoutAnalysis
  domain: DocumentDomain
  options?: {
    timeoutMs?: number
    figureBatchSize?: number
    headingBatchSize?: number
    minConfidence?: number
  }
}

export interface SemanticRepairResult {
  buffer: Buffer
  proposalsAccepted: number
  proposalsRejected: number
  scoreBefore: number
  scoreAfter: number
  batches: SemanticBatchSummary[]
}

export async function applySemanticRepairs(
  input: SemanticRepairInput
): Promise<SemanticRepairResult>
```

**Implementation flow:**

```
1. Build figure candidates from analysis (figures without alt or with poor alt)
2. Build heading candidates from analysis (text blocks that likely should be headings)
3. Render figure crops (1x scale, max 768px, max 90KB per figure)
4. Run figure batches (4 figures per call) in parallel (max 3 concurrent)
5. Run heading batches (8 candidates per call) in parallel (max 3 concurrent)
6. Filter proposals by confidence (figures ≥ 0.6, headings ≥ 0.65)
7. Apply accepted proposals via Python bridge
8. Re-analyze → if score regressed, revert all semantic changes
9. Return result
```

---

## Prompt Design

### Figure Alt Text Prompt

```typescript
function buildFigurePrompt(
  batch: FigureCandidate[],
  context: SemanticContext
): OpenAiCompatMessage[] {
  const systemPrompt = `You are generating alt text for PDF accessibility compliance (WCAG 2.1 AA).
Document: "${context.title ?? context.filename}"
Domain: ${context.domain}
Language: ${context.language ?? 'en'}

Rules:
- Alt text must describe what the figure conveys, not what it looks like
- For ${context.domain} documents: ${DOMAIN_ALT_TEXT_GUIDANCE[context.domain]}
- Maximum 200 characters per alt text
- Decorative figures (dividers, logos, backgrounds) get empty string alt text
- Charts/graphs: describe the trend or key finding, not the axis labels
- Never start with "Image of", "Picture of", "Graph showing" — just describe directly
- If you cannot determine what the figure conveys, set confidence to 0.3`

  const userContent: ContentPart[] = [
    {
      type: 'text',
      text: JSON.stringify(batch.map(f => ({
        id: f.id,
        pageNumber: f.pageNumber,
        surroundingText: f.surroundingText?.slice(0, 200),
        captionText: f.captionText,
        informativeHint: f.informativeHint,
        imageAttachmentIndex: f.attachmentIndex,
      })))
    },
    ...batch.filter(f => f.imageDataUrl).map((f, i) => ({
      type: 'image_url' as const,
      image_url: { url: f.imageDataUrl! }
    }))
  ]

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ]
}
```

**Domain guidance strings:**
```typescript
const DOMAIN_ALT_TEXT_GUIDANCE: Record<DocumentDomain, string> = {
  legal: 'describe legal documents, seals, signatures, and evidence precisely',
  government: 'describe policy charts and statistics with the key finding stated first',
  medical: 'use clinical terminology, describe anatomical diagrams precisely',
  financial: 'state the key trend or value shown; mention time period if visible',
  technical: 'describe diagrams, flowcharts, and architecture with technical precision',
  academic: 'describe research figures with methodology context',
  general: 'describe what the image conveys to someone who cannot see it',
}
```

### Figure Alt Text Tool Definition

```typescript
const PROPOSE_ALT_TEXT_TOOL = {
  name: 'propose_alt_text',
  description: 'Propose alt text for figure candidates',
  parameters: {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            altText: { type: 'string', maxLength: 200 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            isDecorative: { type: 'boolean' },
            rationale: { type: 'string', maxLength: 100 }
          },
          required: ['id', 'altText', 'confidence', 'isDecorative']
        }
      }
    },
    required: ['proposals']
  }
}
```

### Heading Proposal Prompt

```typescript
function buildHeadingPrompt(
  batch: HeadingCandidate[],
  context: SemanticContext
): OpenAiCompatMessage[] {
  const systemPrompt = `You are assigning heading levels (H1-H6) for PDF accessibility.
Document: "${context.title ?? context.filename}"
Domain: ${context.domain}

Rules:
- H1 is the document title (usually only one)
- H2 are major sections
- H3-H4 are subsections
- Do not skip levels (no H1→H3 without H2)
- Only promote text that is clearly a section heading, not body text
- If uncertain, set confidence below 0.65 (it will be rejected)
- Text blocks that are clearly body text should be skipped (confidence 0)`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(batch.map(h => ({
        id: h.id,
        text: h.text.slice(0, 120),
        pageNumber: h.pageNumber,
        fontSize: h.fontSize,
        isBold: h.isBold,
        nearbyContext: h.nearbyContext?.slice(0, 200),
        currentTag: h.currentTag,
      })))
    }
  ]
}
```

---

## Regression Prevention (Semantic)

Unlike Phase 2 (whole-stage revert), semantic proposals are applied atomically then tested:

```typescript
async function applySemanticsWithRegression(
  buffer: Buffer,
  proposals: AcceptedProposal[],
  filename: string,
  scoreBefore: number,
): Promise<{ buffer: Buffer; accepted: AcceptedProposal[]; rejected: AcceptedProposal[] }> {
  
  const newBuffer = await applyProposalsToPdf(buffer, proposals)
  const newAnalysis = await analyzePdf(newBuffer, filename, { profile: 'fast' })
  
  if (newAnalysis.score >= scoreBefore - 1) {
    // Accepted — improvement or neutral (within 1 point)
    return { buffer: newBuffer, accepted: proposals, rejected: [] }
  }
  
  // Regression detected — try removing figure proposals only
  const figureOnlyProposals = proposals.filter(p => p.type === 'heading')
  if (figureOnlyProposals.length < proposals.length) {
    const partialBuffer = await applyProposalsToPdf(buffer, figureOnlyProposals)
    const partialAnalysis = await analyzePdf(partialBuffer, filename, { profile: 'fast' })
    if (partialAnalysis.score >= scoreBefore - 1) {
      const rejected = proposals.filter(p => p.type !== 'heading')
      return { buffer: partialBuffer, accepted: figureOnlyProposals, rejected }
    }
  }
  
  // Full revert
  return { buffer, accepted: [], rejected: proposals }
}
```

**Key difference from v1:** v2 uses type-level grouping (figures vs headings) instead of O(N²) binary search over individual actions. This is simpler and fast enough for batches of ≤ 12 proposals.

---

## Candidate Building

### Figure Candidates

```typescript
export interface FigureCandidate {
  id: string
  pageNumber: number
  bbox: [number, number, number, number]
  hasAlt: boolean
  altQuality: 'none' | 'generic' | 'short' | 'adequate'
  surroundingText: string | null
  captionText: string | null    // from layout pre-pass
  informativeHint: 'chart' | 'diagram' | 'photo' | 'logo' | 'signature' | 'unknown'
  imageDataUrl: string | null   // rendered crop, null if crop failed
  attachmentIndex: number | null
}
```

Candidates are selected from `analysis` where:
- `hasAlt: false` OR `altQuality: 'none'` OR `altQuality: 'generic'`
- AND figure is on a text-heavy page (likely informative, not decorative)
- Skip figures smaller than 50x50 px (likely decorative bullets/icons)

### Heading Candidates

```typescript
export interface HeadingCandidate {
  id: string
  text: string
  pageNumber: number
  fontSize: number
  isBold: boolean
  isAllCaps: boolean
  nearbyContext: string | null  // surrounding paragraph text
  currentTag: string | null     // existing tag if any (e.g. '/P')
  layoutZone: 'main' | 'sidebar' | 'header' | 'footer'
}
```

Candidates are selected from qpdf heading candidates where:
- `currentTag` is not already H1–H6
- Font size is ≥ 1.2x the median body text font size on that page
- Not in `header` or `footer` layout zone

---

## Figure Rendering

```typescript
async function renderFigureCrop(
  buffer: Buffer,
  pageNumber: number,
  bbox: [number, number, number, number],
): Promise<string | null> {
  // Use pdfjs + @napi-rs/canvas to render the page
  // Crop to bbox + 20px padding
  // Resize to max 768px longest dimension
  // Compress to JPEG if > 90KB
  // Return as data: URL
  // Return null on any error
}
```

---

## Environment Variables (Phase 3 Additions)

```env
# LLM endpoint (required for semantic mode)
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=sk-...
OPENAI_COMPAT_MODEL=gpt-4o

# Optional fallback
OPENAI_COMPAT_FALLBACK_BASE_URL=
OPENAI_COMPAT_FALLBACK_API_KEY=
OPENAI_COMPAT_FALLBACK_MODEL=

# Semantic tuning
SEMANTIC_REQUEST_TIMEOUT_MS=30000
SEMANTIC_REQUEST_CONCURRENCY=3
SEMANTIC_MIN_FIGURE_CONFIDENCE=0.6
SEMANTIC_MIN_HEADING_CONFIDENCE=0.65
SEMANTIC_REPAIR_INLINE_FIGURE_IMAGES=0  # 0=multimodal parts, 1=base64 in JSON
```

---

## `/v1/remediate` Request Update (Phase 3)

```typescript
interface RemediateOptions {
  targetGrade?: 'A' | 'B' | 'C'    // default 'A' (score 90)
  maxRounds?: number                  // default 3
  semantic?: boolean                  // default false — Phase 3 adds this
  semanticTimeout?: number            // ms, default 30000
}
```

When `semantic: true`:
1. Run all deterministic stages (Phase 2 pipeline)
2. Re-analyze
3. If `alt_text` score < 90 AND LLM endpoint configured → run semantic pass
4. Re-analyze
5. If score regressed → revert semantic changes
6. Return final result

---

## Tests

### `tests/semantic/domainDetector.test.ts`
- Legal text → `'legal'`
- Illinois government text → `'government'`
- General text → `'general'`
- Null title + empty text → `'general'`

### `tests/semantic/semanticService.test.ts`
- Mock LLM client
- Verify figure batch prompt includes domain guidance
- Verify figure batch includes image attachments
- Verify confidence filtering (< 0.6 rejected)
- Verify regression detection triggers revert
- Verify no LLM calls when `alt_text` score already ≥ 90

### Integration test
- Take 3 ICJIA PDFs with known figure issues
- Run remediation with `semantic: true` (real LLM or recorded fixture)
- Assert `alt_text` score improves
- Assert no other category regresses

---

## Definition of Done (Phase 3)

- [ ] `POST /v1/remediate` with `semantic: true` calls LLM for figure alt text
- [ ] Domain detection works correctly for ICJIA government documents
- [ ] Layout pre-pass correctly identifies captions and excludes headers/footers from heading candidates
- [ ] Figure crops are rendered and sent as multimodal image parts
- [ ] Confidence filtering rejects low-quality proposals
- [ ] Regression prevention reverts semantic changes that lower score
- [ ] Graceful degradation: if no LLM configured, semantic pass is silently skipped
- [ ] Graceful degradation: if LLM times out, revert and return deterministic-only result
- [ ] All Phase 1 and Phase 2 tests still pass
- [ ] `pnpm test` passes all tests
