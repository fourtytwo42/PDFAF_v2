import {
  HEADING_BOOTSTRAP_MAX_TEXT_LEN,
  HEADING_BOOTSTRAP_MIN_SCORE,
  HEADING_BOOTSTRAP_TITLE_MAX_WORDS,
} from '../../config.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import { isFilenameLikeTitle } from '../compliance/icjiaParity.js';
import { buildEligibleHeadingBootstrapCandidates } from '../headingBootstrapCandidates.js';

export type Stage127ZeroHeadingClass =
  | 'visible_anchor_candidate'
  | 'degenerate_marked_content_no_candidate'
  | 'link_only_no_heading_candidate'
  | 'ocr_page_shell_defer'
  | 'no_safe_candidate';

export type VisibleHeadingAnchorSource =
  | 'paragraph_candidate'
  | 'role_tagged_mcid_first_page'
  | 'metadata_visible_match'
  | 'bookmark_visible_match'
  | 'first_page_visible_line';

export interface VisibleHeadingAnchorCandidate {
  page: number;
  mcid?: number;
  targetRef?: string;
  text: string;
  source: VisibleHeadingAnchorSource;
  score: number;
  reasons: string[];
}

export interface Stage127ZeroHeadingDisposition {
  classification: Stage127ZeroHeadingClass;
  candidate: VisibleHeadingAnchorCandidate | null;
  reasons: string[];
}

const MIN_TITLE_CHARS = 8;
const MAX_VISIBLE_TITLE_CHARS = Math.max(HEADING_BOOTSTRAP_MAX_TEXT_LEN, 140);
const GENERATED_PAGE_OUTLINE_RE = /^page\s+\d+$/i;
const OCR_CREATOR_RE = /(ocrmypdf|tesseract|abbyy|omnipage)/i;

function headingScore(analysis: AnalysisResult): number | null {
  const category = analysis.categories.find(row => row.key === 'heading_structure');
  return category?.applicable ? category.score : null;
}

function textExtractabilityScore(analysis: AnalysisResult): number | null {
  const category = analysis.categories.find(row => row.key === 'text_extractability');
  return category?.applicable ? category.score : null;
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeFingerprint(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value: string): number {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/).length : 0;
}

function isTitleCaseLike(value: string): boolean {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > HEADING_BOOTSTRAP_TITLE_MAX_WORDS + 6) return false;
  const alpha = words.filter(word => /[A-Za-z]/.test(word));
  if (alpha.length === 0) return false;
  const titled = alpha.filter(word => /^[A-Z][A-Za-z0-9'/-]*$/.test(word)).length;
  return titled >= Math.ceil(alpha.length * 0.55);
}

function isAllCapsLike(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 6) return false;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return caps / letters.length >= 0.85;
}

function rejectWeakVisibleTitle(value: string, filename: string): boolean {
  const text = normalizeText(value);
  if (text.length < MIN_TITLE_CHARS || text.length > MAX_VISIBLE_TITLE_CHARS) return true;
  if (wordCount(text) < 2 || wordCount(text) > HEADING_BOOTSTRAP_TITLE_MAX_WORDS + 8) return true;
  if (GENERATED_PAGE_OUTLINE_RE.test(text)) return true;
  if (/^(https?:\/\/|www\.)/i.test(text)) return true;
  if (/\b(page\s+\d+|copyright|all rights reserved)\b/i.test(text)) return true;
  if (/\b(governor|director|chairperson|chairman|secretary|commissioner|prepared by|submitted by|author)\b/i.test(text)) return true;
  if (/^[a-z]/.test(text)) return true;
  if (/[.!?]\s+\S/.test(text) && wordCount(text) > 10) return true;
  if (isFilenameLikeTitle(text) && normalizeFingerprint(text) === normalizeFingerprint(filename.replace(/\.pdf$/i, ''))) return true;
  return false;
}

function splitLikelyTitlePrefix(firstPageText: string): string {
  let text = normalizeText(firstPageText);
  const splitters = [
    /\s+Abstract\s*:/i,
    /\s+By\s+[A-Z]/,
    /\s+Vol\.\s*\d+/i,
    /\s+Illinois Criminal Justice Information Authority\b/i,
    /\s+Research Bulletin\b/i,
    /\s+\d\s*\d?\s*\/\s*\d\s*\d?\s*\/\s*\d\s*\d?\s*\d?\s*\d?/,
  ];
  let cut = text.length;
  for (const pattern of splitters) {
    const match = pattern.exec(text);
    if (match && match.index > 0) cut = Math.min(cut, match.index);
  }
  text = text.slice(0, cut).trim();
  if (text.length <= MAX_VISIBLE_TITLE_CHARS) return text;
  const words = text.split(/\s+/).slice(0, HEADING_BOOTSTRAP_TITLE_MAX_WORDS + 6);
  return words.join(' ').slice(0, MAX_VISIBLE_TITLE_CHARS).trim();
}

export function extractFirstPageVisibleHeadingText(snapshot: DocumentSnapshot, filename = ''): string | null {
  const candidate = splitLikelyTitlePrefix(snapshot.textByPage[0] ?? '');
  if (rejectWeakVisibleTitle(candidate, filename)) return null;
  return candidate;
}

function realBookmarkTitle(snapshot: DocumentSnapshot, visibleTitle: string): string | null {
  const visibleKey = normalizeFingerprint(visibleTitle);
  if (!visibleKey) return null;
  for (const bookmark of snapshot.bookmarks ?? []) {
    const title = normalizeText(bookmark.title);
    if (!title || GENERATED_PAGE_OUTLINE_RE.test(title)) continue;
    const key = normalizeFingerprint(title);
    if (key && (key === visibleKey || visibleKey.includes(key) || key.includes(visibleKey))) {
      return title;
    }
  }
  return null;
}

function metadataTitleMatches(snapshot: DocumentSnapshot, visibleTitle: string): boolean {
  const metadataTitle = normalizeText(snapshot.metadata.title ?? snapshot.structTitle);
  if (!metadataTitle || rejectWeakVisibleTitle(metadataTitle, '')) return false;
  const metaKey = normalizeFingerprint(metadataTitle);
  const visibleKey = normalizeFingerprint(visibleTitle);
  return Boolean(metaKey && visibleKey && (metaKey === visibleKey || metaKey.includes(visibleKey) || visibleKey.includes(metaKey)));
}

function roleFromMcidSnippet(snippet: string | undefined): string | null {
  const match = /\/([A-Za-z][A-Za-z0-9]*)\s*<<\s*\/MCID\b/i.exec(snippet ?? '');
  return match?.[1]?.toUpperCase() ?? null;
}

function roleScore(role: string | null): number {
  if (role === 'H' || role === 'H1') return 45;
  if (role === 'H2') return 34;
  if (role === 'H3') return 26;
  return 0;
}

function titleShapeScore(text: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const words = wordCount(text);
  if (words <= HEADING_BOOTSTRAP_TITLE_MAX_WORDS) {
    score += 16;
    reasons.push('compact_title');
  }
  if (text.length >= 12 && text.length <= 100) {
    score += 14;
    reasons.push('title_length');
  }
  if (isTitleCaseLike(text)) {
    score += 18;
    reasons.push('title_case');
  }
  if (isAllCapsLike(text)) {
    score += 18;
    reasons.push('all_caps');
  }
  if (!/[!?]$/.test(text)) {
    score += 6;
    reasons.push('not_question_or_exclamation');
  }
  return { score, reasons };
}

export function selectVisibleHeadingAnchorCandidate(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): VisibleHeadingAnchorCandidate | null {
  const paragraphCandidate = buildEligibleHeadingBootstrapCandidates(snapshot)[0];
  if (paragraphCandidate) {
    return {
      page: paragraphCandidate.page,
      targetRef: paragraphCandidate.structRef,
      text: paragraphCandidate.text,
      source: 'paragraph_candidate',
      score: paragraphCandidate.score,
      reasons: ['existing_paragraph_candidate', ...paragraphCandidate.reasons],
    };
  }

  const visibleTitle = extractFirstPageVisibleHeadingText(snapshot, analysis.filename);
  if (!visibleTitle) return null;
  const shape = titleShapeScore(visibleTitle);
  const bookmark = realBookmarkTitle(snapshot, visibleTitle);
  const metadataMatches = metadataTitleMatches(snapshot, visibleTitle);
  const page0RoleMcids = (snapshot.mcidTextSpans ?? [])
    .filter(row => row.page === 0 && Number.isInteger(row.mcid))
    .map(row => ({
      page: row.page,
      mcid: row.mcid,
      role: roleFromMcidSnippet(row.snippet),
      snippet: row.snippet,
    }))
    .filter(row => roleScore(row.role) > 0)
    .sort((a, b) => roleScore(b.role) - roleScore(a.role) || a.mcid - b.mcid);

  if (page0RoleMcids.length > 0) {
    const best = page0RoleMcids[0]!;
    const source: VisibleHeadingAnchorSource = bookmark
      ? 'bookmark_visible_match'
      : metadataMatches
        ? 'metadata_visible_match'
        : 'role_tagged_mcid_first_page';
    const score = 30 + roleScore(best.role) + shape.score + (bookmark ? 20 : 0) + (metadataMatches ? 12 : 0);
    return {
      page: best.page,
      mcid: best.mcid,
      text: visibleTitle,
      source,
      score,
      reasons: [
        'page0',
        `content_role:${best.role}`,
        ...(bookmark ? ['real_bookmark_visible_match'] : []),
        ...(metadataMatches ? ['metadata_visible_match'] : []),
        ...shape.reasons,
      ],
    };
  }

  return null;
}

export function isOcrPageShell(snapshot: DocumentSnapshot, analysis: AnalysisResult): boolean {
  const creator = `${snapshot.metadata.creator ?? ''} ${snapshot.metadata.producer ?? ''}`;
  return analysis.pdfClass === 'scanned' ||
    snapshot.remediationProvenance?.engineAppliedOcr === true ||
    OCR_CREATOR_RE.test(creator);
}

export function classifyStage127ZeroHeadingAnchor(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage127ZeroHeadingDisposition {
  const reasons: string[] = [];
  const score = headingScore(analysis);
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const treeHeadingCount = headingSignals?.treeHeadingCount ?? snapshot.headings.length;
  if (score == null || score >= 70 || treeHeadingCount > 0 || snapshot.headings.length > 0) {
    return { classification: 'no_safe_candidate', candidate: null, reasons: ['not_zero_heading_tail'] };
  }
  if (isOcrPageShell(snapshot, analysis)) {
    return { classification: 'ocr_page_shell_defer', candidate: null, reasons: ['ocr_or_scanned_shell'] };
  }

  const candidate = selectVisibleHeadingAnchorCandidate(analysis, snapshot);
  if (candidate && candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE) {
    return { classification: 'visible_anchor_candidate', candidate, reasons: ['high_confidence_visible_anchor', ...candidate.reasons] };
  }

  const depth = snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
  if (snapshot.structureTree !== null && depth <= 1 && (snapshot.mcidTextSpans?.length ?? 0) === 0) {
    reasons.push('degenerate_structure_without_mcid_anchor');
    return { classification: 'degenerate_marked_content_no_candidate', candidate: null, reasons };
  }
  if (
    (snapshot.links.length > 0 || (snapshot.annotationAccessibility?.linkAnnotationsMissingStructure ?? 0) > 0) &&
    (snapshot.mcidTextSpans?.length ?? 0) > 0
  ) {
    reasons.push('link_or_annotation_structure_without_safe_heading_anchor');
    return { classification: 'link_only_no_heading_candidate', candidate: null, reasons };
  }
  return { classification: 'no_safe_candidate', candidate: null, reasons: ['no_high_confidence_visible_content_anchor'] };
}

export function shouldTryVisibleHeadingAnchorRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  if (analysis.score >= 70) return false;
  if (analysis.pdfClass === 'scanned') return false;
  if (snapshot.structureTree !== null) return false;
  if (snapshot.textCharCount <= 0) return false;
  if ((snapshot.mcidTextSpans?.length ?? 0) <= 0) return false;
  if ((textExtractabilityScore(analysis) ?? 0) < 60) return false;
  const disposition = classifyStage127ZeroHeadingAnchor(analysis, snapshot);
  return disposition.classification === 'visible_anchor_candidate' &&
    disposition.candidate !== null &&
    disposition.candidate.source !== 'paragraph_candidate' &&
    disposition.candidate.page === 0 &&
    typeof disposition.candidate.mcid === 'number' &&
    disposition.candidate.reasons.some(reason => reason === 'content_role:H' || reason === 'content_role:H1') &&
    disposition.candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE;
}
