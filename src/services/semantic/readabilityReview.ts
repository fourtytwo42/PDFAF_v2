import {
  READABILITY_REVIEW_MAX_FINDINGS,
  READABILITY_REVIEW_MAX_ITEMS,
  READABILITY_REVIEW_MAX_TEXT_CHARS,
  READABILITY_REVIEW_TIMEOUT_MS,
} from '../../config.js';
import type {
  AnalysisResult,
  CategoryKey,
  DocumentSnapshot,
  Grade,
  ReadabilityReviewArea,
  ReadabilityReviewFinding,
  ReadabilityReviewSkippedReason,
  ReadabilityReviewStatus,
  ReadabilityReviewSummary,
  Severity,
} from '../../types.js';
import { chatCompletionToolCall, getLlmEndpoints } from './openAiCompatClient.js';

const REVIEW_AREAS: ReadabilityReviewArea[] = [
  'overall',
  'reading_order',
  'heading_structure',
  'alt_text',
  'table_markup',
  'link_quality',
  'form_accessibility',
  'text_extractability',
  'pdf_ua_compliance',
  'assistive_technology',
];

const REVIEW_FINDING_SEVERITIES: Array<Exclude<Severity, 'pass'>> = ['critical', 'moderate', 'minor'];

const GRADE_PDF_READABILITY_TOOL = {
  type: 'function',
  function: {
    name: 'grade_pdf_readability',
    description: 'Grade likely screen-reader readability from a compact accessibility proxy.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'status', 'confidence', 'summary', 'strengths', 'findings', 'manualReviewRecommended', 'manualReviewReasons'],
      properties: {
        score: { type: 'number', minimum: 0, maximum: 100 },
        status: { type: 'string', enum: ['passed', 'warn', 'failed'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        summary: { type: 'string' },
        strengths: { type: 'array', maxItems: 6, items: { type: 'string' } },
        findings: {
          type: 'array',
          maxItems: READABILITY_REVIEW_MAX_FINDINGS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['area', 'severity', 'message'],
            properties: {
              area: { type: 'string', enum: REVIEW_AREAS },
              severity: { type: 'string', enum: REVIEW_FINDING_SEVERITIES },
              message: { type: 'string' },
              evidence: { type: 'string' },
              page: { type: 'number' },
              recommendation: { type: 'string' },
            },
          },
        },
        manualReviewRecommended: { type: 'boolean' },
        manualReviewReasons: { type: 'array', maxItems: 8, items: { type: 'string' } },
      },
    },
  },
} as const;

export interface ReadabilityReviewInput {
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  options?: { timeoutMs?: number; signal?: AbortSignal };
}

interface ReadabilityProxy {
  filename: string;
  pageCount: number;
  pdfClass: AnalysisResult['pdfClass'];
  score: number;
  grade: Grade;
  verificationLevel: AnalysisResult['verificationLevel'];
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
  categories: Array<{
    key: CategoryKey;
    score: number;
    severity: Severity;
    applicable: boolean;
    verificationLevel?: string;
    manualReviewRequired?: boolean;
    manualReviewReasons?: string[];
    findings: string[];
  }>;
  structure: Record<string, unknown>;
  headings: Array<{ level: number; text: string; page: number }>;
  figures: Array<{ page: number; role?: string; rawRole?: string; hasAlt: boolean; altText?: string; isArtifact: boolean }>;
  tables: Array<{ page: number; hasHeaders: boolean; headerCount: number; totalCells: number; rowCount?: number; irregularRows?: number; cellsMisplacedCount?: number }>;
  links: Array<{ page: number; text: string; url: string }>;
  formFields: Array<{ page: number; name: string; tooltip?: string | null }>;
  importantFindings: Array<{ category: CategoryKey; severity: Severity; message: string; page?: number }>;
  pageTextSamples: Array<{ page: number; text: string }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compactText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string | null | undefined, max: number): string {
  const text = compactText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown, maxItems: number, maxLen = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => truncate(String(item ?? ''), maxLen)).filter(Boolean).slice(0, maxItems);
}

function gradeFor(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function normalizeStatus(value: unknown, score: number | null, findings: ReadabilityReviewFinding[]): ReadabilityReviewStatus {
  if (value === 'passed' || value === 'warn' || value === 'failed') return value;
  if (findings.some(finding => finding.severity === 'critical')) return 'failed';
  if (score == null) return 'warn';
  if (score >= 90) return 'passed';
  if (score >= 70) return 'warn';
  return 'failed';
}

function normalizeArea(value: unknown): ReadabilityReviewArea {
  const text = String(value ?? 'overall');
  return REVIEW_AREAS.includes(text as ReadabilityReviewArea) ? text as ReadabilityReviewArea : 'overall';
}

function normalizeFindingSeverity(value: unknown): Exclude<Severity, 'pass'> {
  const text = String(value ?? 'minor');
  return REVIEW_FINDING_SEVERITIES.includes(text as Exclude<Severity, 'pass'>) ? text as Exclude<Severity, 'pass'> : 'minor';
}

function normalizeFindings(value: unknown): ReadabilityReviewFinding[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row != null)
    .map(row => {
      const page = Number(row['page']);
      return {
        area: normalizeArea(row['area']),
        severity: normalizeFindingSeverity(row['severity']),
        message: truncate(String(row['message'] ?? ''), 320) || 'Unspecified readability concern.',
        ...(row['evidence'] != null ? { evidence: truncate(String(row['evidence']), 320) } : {}),
        ...(Number.isFinite(page) ? { page } : {}),
        ...(row['recommendation'] != null ? { recommendation: truncate(String(row['recommendation']), 320) } : {}),
      };
    })
    .filter(row => row.message.length > 0)
    .slice(0, READABILITY_REVIEW_MAX_FINDINGS);
}

function pageIndexFrom(value: unknown, pageCount: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const raw = Math.trunc(n);
  const candidate = raw >= 1 && raw <= pageCount ? raw - 1 : raw;
  if (candidate < 0 || candidate >= pageCount) return null;
  return candidate;
}

function selectedPageIndexes(snapshot: DocumentSnapshot, analysis: AnalysisResult): number[] {
  const out = new Set<number>();
  if (snapshot.pageCount > 0) out.add(0);
  if (snapshot.pageCount > 1) out.add(snapshot.pageCount - 1);
  for (const finding of analysis.findings) {
    const page = pageIndexFrom(finding.page, snapshot.pageCount);
    if (page != null) out.add(page);
    if (out.size >= 12) break;
  }
  for (const row of [...snapshot.headings, ...snapshot.figures, ...snapshot.tables]) {
    const page = pageIndexFrom(row.page, snapshot.pageCount);
    if (page != null) out.add(page);
    if (out.size >= 12) break;
  }
  return [...out].sort((a, b) => a - b).slice(0, 12);
}

function pageTextSamples(snapshot: DocumentSnapshot, analysis: AnalysisResult): Array<{ page: number; text: string }> {
  let remaining = Math.max(1000, READABILITY_REVIEW_MAX_TEXT_CHARS);
  const out: Array<{ page: number; text: string }> = [];
  for (const index of selectedPageIndexes(snapshot, analysis)) {
    if (remaining <= 0) break;
    const text = compactText(snapshot.textByPage[index] ?? '');
    if (!text) continue;
    const take = Math.min(1600, remaining);
    const snippet = truncate(text, take);
    out.push({ page: index + 1, text: snippet });
    remaining -= snippet.length;
  }
  return out;
}

function buildReadabilityProxy(input: ReadabilityReviewInput): { proxy: ReadabilityProxy; summary: ReadabilityReviewSummary['proxy'] } {
  const { analysis, snapshot, filename } = input;
  const findingsByCategory = new Map<CategoryKey, string[]>();
  for (const finding of analysis.findings) {
    const rows = findingsByCategory.get(finding.category) ?? [];
    if (rows.length < 4) rows.push(truncate(finding.message, 260));
    findingsByCategory.set(finding.category, rows);
  }
  const proxy: ReadabilityProxy = {
    filename,
    pageCount: analysis.pageCount,
    pdfClass: analysis.pdfClass,
    score: analysis.scoreProfile.overallScore,
    grade: analysis.scoreProfile.grade,
    verificationLevel: analysis.verificationLevel,
    manualReviewRequired: analysis.manualReviewRequired === true,
    manualReviewReasons: (analysis.manualReviewReasons ?? []).slice(0, 8).map(reason => truncate(reason, 260)),
    categories: analysis.categories.map(category => ({
      key: category.key,
      score: category.score,
      severity: category.severity,
      applicable: category.applicable,
      verificationLevel: category.verificationLevel,
      manualReviewRequired: category.manualReviewRequired,
      manualReviewReasons: (category.manualReviewReasons ?? []).slice(0, 4).map(reason => truncate(reason, 220)),
      findings: findingsByCategory.get(category.key) ?? [],
    })),
    structure: {
      isTagged: snapshot.isTagged,
      markInfo: snapshot.markInfo,
      language: snapshot.lang ?? snapshot.metadata.language ?? null,
      title: snapshot.structTitle ?? snapshot.metadata.title ?? null,
      structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? snapshot.structureDebug?.rootReachableDepth ?? null,
      readingOrderSignals: snapshot.detectionProfile?.readingOrderSignals ?? null,
      headingSignals: snapshot.detectionProfile?.headingSignals ?? null,
      figureSignals: snapshot.detectionProfile?.figureSignals ?? null,
      tableSignals: snapshot.detectionProfile?.tableSignals ?? null,
      listSignals: snapshot.detectionProfile?.listSignals ?? null,
      pdfUaSignals: snapshot.detectionProfile?.pdfUaSignals ?? null,
    },
    headings: snapshot.headings.slice(0, READABILITY_REVIEW_MAX_ITEMS).map(h => ({ level: h.level, text: truncate(h.text, 160), page: h.page + 1 })),
    figures: snapshot.figures.slice(0, READABILITY_REVIEW_MAX_ITEMS).map(f => ({
      page: f.page + 1,
      role: f.role,
      rawRole: f.rawRole,
      hasAlt: f.hasAlt,
      altText: f.altText ? truncate(f.altText, 200) : undefined,
      isArtifact: f.isArtifact,
    })),
    tables: snapshot.tables.slice(0, READABILITY_REVIEW_MAX_ITEMS).map(t => ({
      page: t.page + 1,
      hasHeaders: t.hasHeaders,
      headerCount: t.headerCount,
      totalCells: t.totalCells,
      rowCount: t.rowCount,
      irregularRows: t.irregularRows,
      cellsMisplacedCount: t.cellsMisplacedCount,
    })),
    links: snapshot.links.slice(0, READABILITY_REVIEW_MAX_ITEMS).map(link => ({ page: link.page + 1, text: truncate(link.text, 160), url: truncate(link.url, 160) })),
    formFields: [...snapshot.formFields, ...snapshot.formFieldsFromPdfjs]
      .slice(0, READABILITY_REVIEW_MAX_ITEMS)
      .map(field => ({ page: field.page + 1, name: truncate(field.name, 160), tooltip: field.tooltip ? truncate(field.tooltip, 160) : null })),
    importantFindings: analysis.findings
      .filter(finding => finding.severity === 'critical' || finding.severity === 'moderate' || finding.manualReviewRequired === true)
      .slice(0, READABILITY_REVIEW_MAX_ITEMS)
      .map(finding => ({
        category: finding.category,
        severity: finding.severity,
        message: truncate(finding.message, 260),
        ...(finding.page != null ? { page: finding.page + 1 } : {}),
      })),
    pageTextSamples: pageTextSamples(snapshot, analysis),
  };
  return {
    proxy,
    summary: {
      pageCount: snapshot.pageCount,
      sampledPages: proxy.pageTextSamples.map(row => row.page),
      textCharCount: snapshot.textCharCount,
      headingCount: snapshot.headings.length,
      figureCount: snapshot.figures.length,
      tableCount: snapshot.tables.length,
      linkCount: snapshot.links.length,
      formFieldCount: snapshot.formFields.length + snapshot.formFieldsFromPdfjs.length,
    },
  };
}

function skippedReview(input: { reason: ReadabilityReviewSkippedReason; durationMs: number; summary: string; manualReviewReasons?: string[]; proxy?: ReadabilityReviewSummary['proxy'] }): ReadabilityReviewSummary {
  return {
    status: input.reason === 'error' ? 'error' : 'skipped',
    score: null,
    grade: null,
    confidence: 'unknown',
    durationMs: input.durationMs,
    skippedReason: input.reason,
    summary: input.summary,
    strengths: [],
    findings: [],
    manualReviewRecommended: input.reason === 'error',
    manualReviewReasons: input.manualReviewReasons ?? [],
    ...(input.proxy ? { proxy: input.proxy } : {}),
  };
}

function normalizeReviewPayload(args: Record<string, unknown>, meta: { durationMs: number; endpoint: 'primary' | 'fallback'; model: string; proxy: ReadabilityReviewSummary['proxy'] }): ReadabilityReviewSummary {
  const rawScore = Number(args['score']);
  const score = Number.isFinite(rawScore) ? clamp(Math.round(rawScore), 0, 100) : null;
  const findings = normalizeFindings(args['findings']);
  const status = normalizeStatus(args['status'], score, findings);
  const confidence = args['confidence'] === 'high' || args['confidence'] === 'medium' || args['confidence'] === 'low' ? args['confidence'] : 'low';
  const manualReviewReasons = strings(args['manualReviewReasons'], 8);
  const manualReviewRecommended = Boolean(args['manualReviewRecommended']) || status !== 'passed' || manualReviewReasons.length > 0;
  return {
    status,
    score,
    grade: score == null ? null : gradeFor(score),
    confidence,
    durationMs: meta.durationMs,
    model: meta.model,
    endpoint: meta.endpoint,
    summary: truncate(String(args['summary'] ?? ''), 700) || 'AI readability review completed.',
    strengths: strings(args['strengths'], 6),
    findings,
    manualReviewRecommended,
    manualReviewReasons,
    proxy: meta.proxy,
  };
}

export async function reviewRemediatedReadability(input: ReadabilityReviewInput): Promise<ReadabilityReviewSummary> {
  const started = Date.now();
  const endpoints = getLlmEndpoints();
  const { proxy, summary } = buildReadabilityProxy(input);
  if (endpoints.length === 0) {
    return skippedReview({ reason: 'no_llm_config', durationMs: Date.now() - started, summary: 'AI readability review skipped because no OpenAI-compatible endpoint is configured.', proxy: summary });
  }
  const messages = [
    {
      role: 'system' as const,
      content: `You are an accessibility QA reviewer for remediated PDFs.
You are reviewing a compact proxy of the final PDF tags, text extraction, findings, and structural signals. Grade the likely screen-reader reading experience, not visual design.
Be conservative: a syntactically valid PDF can still read poorly. Do not certify legal compliance. If the proxy lacks enough evidence, lower confidence and recommend manual assistive-technology review.
Focus on reading order, heading navigation, figure alternate text, tables, links/forms, text extraction, and whether remaining findings would disrupt a screen-reader user.`,
    },
    {
      role: 'user' as const,
      content: `Return only the grade_pdf_readability tool call. Score 0-100 where 90+ means likely good screen-reader readability, 70-89 means review recommended, and below 70 means likely poor. Ground every finding in the proxy evidence.\n\nPDF readability proxy JSON:\n${JSON.stringify(proxy)}`,
    },
  ];
  try {
    const { endpoint, payload } = await chatCompletionToolCall({
      messages,
      tools: [GRADE_PDF_READABILITY_TOOL],
      toolChoice: { type: 'function', function: { name: 'grade_pdf_readability' } },
      timeoutMs: input.options?.timeoutMs ?? READABILITY_REVIEW_TIMEOUT_MS,
      signal: input.options?.signal,
      operation: 'readability_review',
      traceId: `${input.filename}:readability_review`,
    });
    return normalizeReviewPayload(payload.arguments, { durationMs: Date.now() - started, endpoint: endpoint.label, model: endpoint.model, proxy: summary });
  } catch (error) {
    if (input.options?.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : 'unknown_error';
    return skippedReview({ reason: 'error', durationMs: Date.now() - started, summary: 'AI readability review failed; remediation output was still produced.', manualReviewReasons: [`AI readability review failed: ${truncate(message, 240)}`], proxy: summary });
  }
}
