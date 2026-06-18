import type { AnalysisResult, DocumentSnapshot, NativeLayoutAudit } from '../../types.js';
import {
  buildEligibleHeadingBootstrapCandidates,
  type HeadingBootstrapCandidate,
} from '../headingBootstrapCandidates.js';

export const REPORT_LAYOUT_HEADING_RECOVERY_SIGNAL = 'report_layout_heading_recovery_candidate';

export type ReportLayoutHeadingRecoveryKind =
  | typeof REPORT_LAYOUT_HEADING_RECOVERY_SIGNAL
  | 'no_report_layout_heading_recovery';

export type ReportLayoutHeadingTargetType =
  | 'paragraph_struct_elem'
  | 'mcid_text_span'
  | 'native_title_bt'
  | 'layout_text';

export interface ReportLayoutHeadingTargetMatch {
  type: ReportLayoutHeadingTargetType;
  targetId: string;
  text: string;
  page: number;
  paragraphCandidate?: HeadingBootstrapCandidate;
}

export interface ReportLayoutHeadingRecoveryDisposition {
  kind: ReportLayoutHeadingRecoveryKind;
  reasons: string[];
  readingOrderScore: number | null;
  headingStructureScore: number | null;
  layoutHeadingCandidateCount: number;
  sampledPageCount: number;
  layoutHeadingDensity: number;
  repeatedHeaderFooterPageCount: number;
  existingTargetMatchCount: number;
  paragraphTargetMatchCount: number;
  mcidTargetMatchCount: number;
  nativeTitleTargetMatchCount: number;
  paragraphCandidates: HeadingBootstrapCandidate[];
  matches: ReportLayoutHeadingTargetMatch[];
}

const MIN_LAYOUT_HEADING_CANDIDATES = 12;
const MIN_REPEATED_HEADER_FOOTER_PAGES = 2;
const MIN_LAYOUT_HEADING_DENSITY = 1.5;
const MIN_EXISTING_TARGET_MATCHES = 2;
const MIN_SAMPLED_PAGE_COUNT = 7;

const CAPTION_RE = /^(figure|fig\.|chart|graph|table)\s*[\dA-ZIVX]+[\s:.\-]/i;

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return typeof category?.score === 'number' && category.applicable !== false ? category.score : null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function fingerprint(value: string | undefined | null): string {
  return normalizeText(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenCount(value: string): number {
  const key = fingerprint(value);
  return key ? key.split(' ').length : 0;
}

function strongTextMatch(a: string, b: string): boolean {
  const left = fingerprint(a);
  const right = fingerprint(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 8 && tokenCount(shorter) >= 2 && longer.includes(shorter);
}

function rectsOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function nearPoint(bbox: [number, number, number, number], x: number | null, y: number | null): boolean {
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  const pad = 40;
  return x >= bbox[0] - pad && x <= bbox[2] + pad && y >= bbox[1] - pad && y <= bbox[3] + pad;
}

function looksLikeTableLine(text: string): boolean {
  return /\t|\s{4,}|\|/.test(text);
}

function looksLikeTableOfContentsLine(text: string): boolean {
  const normalized = normalizeText(text);
  return /\.{3,}/.test(normalized) && /\b\d+\s*$/.test(normalized);
}

function isExcludedLayoutHeadingCandidate(
  candidate: { text: string; page: number; bbox: [number, number, number, number] },
  layout: NativeLayoutAudit,
): boolean {
  if (CAPTION_RE.test(candidate.text) || looksLikeTableLine(candidate.text) || looksLikeTableOfContentsLine(candidate.text)) return true;
  if (layout.headerFooterBandTexts.some(band => band.page === candidate.page && strongTextMatch(band.text, candidate.text))) {
    return true;
  }
  if (layout.captionCandidates.some(row => row.page === candidate.page && rectsOverlap(row.bbox, candidate.bbox))) {
    return true;
  }
  return layout.tableCandidates.some(row => row.page === candidate.page && rectsOverlap(row.bbox, candidate.bbox));
}

function uniqueMatches(matches: ReportLayoutHeadingTargetMatch[]): ReportLayoutHeadingTargetMatch[] {
  const seen = new Set<string>();
  const out: ReportLayoutHeadingTargetMatch[] = [];
  for (const match of matches) {
    const key = `${match.type}:${match.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function buildMatches(
  snapshot: DocumentSnapshot,
  layout: NativeLayoutAudit,
  paragraphCandidates: HeadingBootstrapCandidate[],
): ReportLayoutHeadingTargetMatch[] {
  const matches: ReportLayoutHeadingTargetMatch[] = [];
  for (const candidate of layout.layoutHeadingCandidates) {
    if (isExcludedLayoutHeadingCandidate(candidate, layout)) continue;

    const paragraph = paragraphCandidates.find(row =>
      row.page === candidate.page && strongTextMatch(row.text, candidate.text),
    );
    if (paragraph) {
      matches.push({
        type: 'paragraph_struct_elem',
        targetId: paragraph.structRef,
        text: candidate.text,
        page: candidate.page,
        paragraphCandidate: paragraph,
      });
      continue;
    }

    const mcid = (snapshot.mcidTextSpans ?? []).find(row => {
      if (row.page !== candidate.page) return false;
      const text = row.resolvedText ?? row.snippet;
      return tokenCount(text) >= 2 && strongTextMatch(text, candidate.text);
    });
    if (mcid) {
      matches.push({
        type: 'mcid_text_span',
        targetId: `page:${mcid.page}:mcid:${mcid.mcid}`,
        text: candidate.text,
        page: candidate.page,
      });
      continue;
    }

    const nativeTitle = (snapshot.nativeTitleBtCandidates ?? []).find(row =>
      candidate.page === 0 && nearPoint(candidate.bbox, row.x, row.y),
    );
    if (nativeTitle) {
      matches.push({
        type: 'native_title_bt',
        targetId: `page:${nativeTitle.page}:group:${nativeTitle.groupIndexes.join(',')}`,
        text: candidate.text,
        page: candidate.page,
      });
      continue;
    }

    matches.push({
      type: 'layout_text',
      targetId: `layout:${candidate.page}:${fingerprint(candidate.text).slice(0, 48) || 'candidate'}`,
      text: candidate.text,
      page: candidate.page,
    });
  }
  return uniqueMatches(matches);
}

export function classifyReportLayoutHeadingRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): ReportLayoutHeadingRecoveryDisposition {
  const reasons: string[] = [];
  const readingOrderScore = categoryScore(analysis, 'reading_order');
  const headingStructureScore = categoryScore(analysis, 'heading_structure');
  const layout = snapshot.layoutAudit;
  const sampledPageCount = Math.max(0, layout?.sampledPageCount ?? 0);
  const layoutHeadingCandidateCount = layout?.layoutHeadingCandidateCount ?? 0;
  const repeatedHeaderFooterPageCount = layout?.repeatedHeaderFooterPageCount ?? 0;
  const layoutHeadingDensity = sampledPageCount > 0 ? layoutHeadingCandidateCount / sampledPageCount : 0;
  const paragraphCandidates = stageCandidateParagraphs(snapshot);
  const matches = layout ? buildMatches(snapshot, layout, paragraphCandidates) : [];
  const paragraphMatches = matches.filter(match => match.type === 'paragraph_struct_elem');
  const hasNonParagraphTextMatch = matches.some(
    match => (match.type === 'layout_text' || match.type === 'native_title_bt') && tokenCount(match.text) >= 3,
  );
  const mcidTargetMatchCount = matches.filter(match => match.type === 'mcid_text_span').length;
  const nativeTitleTargetMatchCount = matches.filter(match => match.type === 'native_title_bt').length;
  const paragraphCandidatesWithLayoutMatch = paragraphMatches
    .map(match => match.paragraphCandidate)
    .filter((candidate): candidate is HeadingBootstrapCandidate => candidate !== undefined);

  if (analysis.pdfClass === 'scanned') reasons.push('scanned_pdf');
  if (snapshot.structureTree === null) reasons.push('missing_structure_tree');
  if (!layout) reasons.push('missing_layout_audit');
  if (sampledPageCount < MIN_SAMPLED_PAGE_COUNT) reasons.push('sampled_pages_below_' + MIN_SAMPLED_PAGE_COUNT + ':' + sampledPageCount);
  if (sampledPageCount <= 0) reasons.push('no_sampled_pages');
  if (!((readingOrderScore ?? 100) <= 80 || (headingStructureScore ?? 100) <= 80)) {
    reasons.push('reading_and_heading_scores_above_report_layout_threshold');
  }
  if (layoutHeadingCandidateCount < MIN_LAYOUT_HEADING_CANDIDATES) {
    reasons.push(`layout_heading_candidates_below_${MIN_LAYOUT_HEADING_CANDIDATES}:${layoutHeadingCandidateCount}`);
  }
  if (repeatedHeaderFooterPageCount < MIN_REPEATED_HEADER_FOOTER_PAGES) {
    reasons.push(`repeated_header_footer_pages_below_${MIN_REPEATED_HEADER_FOOTER_PAGES}:${repeatedHeaderFooterPageCount}`);
  }
  if (layoutHeadingDensity < MIN_LAYOUT_HEADING_DENSITY) {
    reasons.push(`layout_heading_density_below_${MIN_LAYOUT_HEADING_DENSITY}:${layoutHeadingDensity.toFixed(2)}`);
  }
  if (matches.length < MIN_EXISTING_TARGET_MATCHES) {
    reasons.push(`existing_target_matches_below_${MIN_EXISTING_TARGET_MATCHES}:${matches.length}`);
  }
  const paragraphBackedCandidateAvailable = paragraphCandidatesWithLayoutMatch.length > 0 || snapshot.structureTree === null;
  const hasTextOrTitleCandidateEvidence = hasNonParagraphTextMatch || paragraphBackedCandidateAvailable;

  if (snapshot.structureTree !== null && paragraphCandidatesWithLayoutMatch.length < 1 && !hasNonParagraphTextMatch) {
    reasons.push('no_paragraph_backed_heading_candidate');
  }

  const canRecover =
    analysis.pdfClass !== 'scanned' &&
    (snapshot.structureTree !== null || analysis.pdfClass === 'native_untagged') &&
    layout !== undefined &&
    sampledPageCount >= MIN_SAMPLED_PAGE_COUNT &&
    ((readingOrderScore ?? 100) <= 80 || (headingStructureScore ?? 100) <= 80) &&
    layoutHeadingCandidateCount >= MIN_LAYOUT_HEADING_CANDIDATES &&
    repeatedHeaderFooterPageCount >= MIN_REPEATED_HEADER_FOOTER_PAGES &&
    layoutHeadingDensity >= MIN_LAYOUT_HEADING_DENSITY &&
    matches.length >= MIN_EXISTING_TARGET_MATCHES &&
    hasTextOrTitleCandidateEvidence;

  return {
    kind: canRecover ? REPORT_LAYOUT_HEADING_RECOVERY_SIGNAL : 'no_report_layout_heading_recovery',
    reasons: canRecover
      ? [
        `report_layout_heading_evidence:heads=${layoutHeadingCandidateCount},sampledPages=${sampledPageCount},hfPages=${repeatedHeaderFooterPageCount}`,
        `existing_target_matches:${matches.length}`,
        `paragraph_target_matches:${paragraphCandidatesWithLayoutMatch.length}`,
      ]
      : reasons,
    readingOrderScore,
    headingStructureScore,
    layoutHeadingCandidateCount,
    sampledPageCount,
    layoutHeadingDensity,
    repeatedHeaderFooterPageCount,
    existingTargetMatchCount: matches.length,
    paragraphTargetMatchCount: paragraphCandidatesWithLayoutMatch.length,
    mcidTargetMatchCount,
    nativeTitleTargetMatchCount,
    paragraphCandidates: paragraphCandidatesWithLayoutMatch,
    matches,
  };
}

function stageCandidateParagraphs(snapshot: DocumentSnapshot): HeadingBootstrapCandidate[] {
  return buildEligibleHeadingBootstrapCandidates(snapshot);
}
