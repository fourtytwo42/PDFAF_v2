import type { DocumentSnapshot, Grade } from '../../types.js';

const STRICT_WEIGHTS = {
  text_extractability: 0.2,
  title_language: 0.15,
  heading_structure: 0.15,
  reading_order: 0.05,
} as const;

type IcjiaParityCategoryKey =
  | 'text_extractability'
  | 'title_language'
  | 'heading_structure'
  | 'reading_order';

export interface IcjiaParityCategoryResult {
  key: IcjiaParityCategoryKey;
  score: number;
  findings: string[];
}

export interface IcjiaParitySignals {
  hasStructTree: boolean;
  structTreeDepth: number;
  /** Depth computed by running qpdf --json — matches ICJIA's calculateTreeDepth() exactly. -1 = unavailable. */
  qpdfVerifiedDepth: number;
  hasText: boolean;
  textLength: number;
  title: string | null;
  lang: string | null;
  rootReachableHeadingCount: number;
  globalHeadingCount: number;
  globalH1Count: number;
  embeddedFontCount: number;
  nonEmbeddedFontCount: number;
}

export interface IcjiaParityResult {
  overallScore: number;
  grade: Grade;
  categories: Record<IcjiaParityCategoryKey, IcjiaParityCategoryResult>;
  findingsSummary: string[];
  signals: IcjiaParitySignals;
}

function normalizeStructType(type: string | undefined): string {
  return (type ?? '').replace(/^\//, '').trim();
}

function walkTree(
  node: DocumentSnapshot['structureTree'],
  depth = 0,
): Array<{ type: string; depth: number }> {
  if (!node) return [];
  const out = [{ type: normalizeStructType(node.type), depth }];
  for (const child of node.children ?? []) out.push(...walkTree(child, depth + 1));
  return out;
}

export function isFilenameLikeTitle(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.docx') || /^[a-z0-9_-]+$/i.test(lower);
}

function effectiveMetadataTitle(snapshot: DocumentSnapshot): string | null {
  const title = snapshot.metadata.title?.trim() ?? '';
  return title && !isFilenameLikeTitle(title) ? title : null;
}

function deriveSignals(snapshot: DocumentSnapshot, qpdfVerifiedDepth = -1): IcjiaParitySignals {
  const nodes = walkTree(snapshot.structureTree);
  const headingNodes = nodes.filter(node => /^H([1-6])?$/.test(node.type));
  const nonEmbeddedFontCount = snapshot.fonts.filter(font => !font.isEmbedded).length;
  const embeddedFontCount = snapshot.fonts.filter(font => font.isEmbedded).length;
  const title = effectiveMetadataTitle(snapshot);
  const lang = (snapshot.lang ?? snapshot.metadata.language ?? '').trim() || null;
  const pikepdfDepth =
    snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth
    ?? (nodes.length > 0 ? Math.max(...nodes.map(node => node.depth)) : 0);
  // Prefer qpdf-verified depth when available: it is identical to ICJIA's algorithm.
  const structTreeDepth = qpdfVerifiedDepth >= 0 ? qpdfVerifiedDepth : pikepdfDepth;
  return {
    hasStructTree: snapshot.structureTree !== null,
    structTreeDepth,
    qpdfVerifiedDepth,
    hasText: (snapshot.textCharCount ?? 0) > 0,
    textLength: snapshot.textCharCount ?? 0,
    title,
    lang,
    rootReachableHeadingCount:
      snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? headingNodes.length,
    globalHeadingCount: snapshot.headings.length,
    globalH1Count: snapshot.headings.filter(h => h.level === 1).length,
    embeddedFontCount,
    nonEmbeddedFontCount,
  };
}

function categoryGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function scoreTextExtractability(signals: IcjiaParitySignals): IcjiaParityCategoryResult {
  let score: number;
  const findings: string[] = [];
  if (signals.hasText && signals.hasStructTree) {
    score = 100;
    findings.push('PDF contains extractable text and a StructTreeRoot.');
  } else if (signals.hasText && !signals.hasStructTree) {
    score = 50;
    findings.push('PDF contains extractable text but has no StructTreeRoot.');
  } else if (!signals.hasText && signals.hasStructTree) {
    score = 25;
    findings.push('StructTreeRoot exists, but no extractable text was found.');
  } else {
    score = 0;
    findings.push('No extractable text and no StructTreeRoot were found.');
  }
  if (signals.nonEmbeddedFontCount > 0) {
    score = Math.min(score, 85);
    findings.push(`${signals.nonEmbeddedFontCount} non-embedded font(s) cap text extractability at 85.`);
  }
  return { key: 'text_extractability', score, findings };
}

function scoreTitleLanguage(signals: IcjiaParitySignals): IcjiaParityCategoryResult {
  let score = 0;
  const findings: string[] = [];
  if (signals.title) {
    score += 50;
    findings.push(`Document title: "${signals.title}"`);
  } else {
    findings.push('No descriptive document title found in document info metadata.');
  }
  if (signals.lang) {
    score += 50;
    findings.push(`Language declared: ${signals.lang}`);
  } else {
    findings.push('No language declaration found.');
  }
  return { key: 'title_language', score, findings };
}

function scoreHeadingStructure(signals: IcjiaParitySignals): IcjiaParityCategoryResult {
  const findings: string[] = [];
  if (signals.globalHeadingCount === 0) {
    return {
      key: 'heading_structure',
      score: 0,
      findings: ['No heading tags were found in the document structure.'],
    };
  }
  let score = 100;
  if (signals.globalH1Count === 0) {
    score = Math.min(score, 80);
    findings.push('No H1 heading found.');
  } else if (signals.globalH1Count > 1) {
    score = Math.min(score, 94);
    findings.push(`${signals.globalH1Count} H1 headings found.`);
  }
  if (signals.rootReachableHeadingCount === 0) {
    score = Math.min(score, 45);
    findings.push('No root-reachable heading nodes were found from StructTreeRoot/K.');
  }
  return { key: 'heading_structure', score, findings };
}

function scoreReadingOrder(signals: IcjiaParitySignals): IcjiaParityCategoryResult {
  const findings: string[] = [];
  if (!signals.hasStructTree) {
    return {
      key: 'reading_order',
      score: 0,
      findings: ['No StructTreeRoot found.'],
    };
  }
  if (signals.structTreeDepth <= 1) {
    return {
      key: 'reading_order',
      score: 30,
      findings: [`Structure tree depth: ${signals.structTreeDepth}`],
    };
  }
  return {
    key: 'reading_order',
    score: 100,
    findings: [`Structure tree depth: ${signals.structTreeDepth}`],
  };
}

function overallScore(categories: Record<IcjiaParityCategoryKey, IcjiaParityCategoryResult>): number {
  const raw =
    categories.text_extractability.score * STRICT_WEIGHTS.text_extractability +
    categories.title_language.score * STRICT_WEIGHTS.title_language +
    categories.heading_structure.score * STRICT_WEIGHTS.heading_structure +
    categories.reading_order.score * STRICT_WEIGHTS.reading_order;
  const weightTotal = Object.values(STRICT_WEIGHTS).reduce((sum, value) => sum + value, 0);
  return Math.round(raw / weightTotal);
}

export function buildIcjiaParity(snapshot: DocumentSnapshot, qpdfVerifiedDepth = -1): IcjiaParityResult {
  const signals = deriveSignals(snapshot, qpdfVerifiedDepth);
  const categories = {
    text_extractability: scoreTextExtractability(signals),
    title_language: scoreTitleLanguage(signals),
    heading_structure: scoreHeadingStructure(signals),
    reading_order: scoreReadingOrder(signals),
  };
  const score = overallScore(categories);
  return {
    overallScore: score,
    grade: categoryGrade(score),
    categories,
    findingsSummary: Object.values(categories).flatMap(category => category.findings.slice(0, 2)),
    signals,
  };
}
