import { HEADING_BOOTSTRAP_MIN_SCORE } from '../../config.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import { isWeakVisibleHeadingAnchorText, isOcrPageShell } from './visibleHeadingAnchor.js';

export type Stage170NativeTitleOwnerClass =
  | 'native_title_bt_owner_bridge_candidate'
  | 'native_title_existing_mcid_owner_candidate'
  | 'native_title_visible_but_unlocatable'
  | 'native_title_visual_or_link_risk'
  | 'route_order_volatility'
  | 'already_fixed_control'
  | 'no_safe_anchor';

export interface NativeTitleOwnerBridgeCandidate {
  page: number;
  groupIndexes: number[];
  text: string;
  score: number;
  fontSize: number;
  x: number | null;
  y: number | null;
  reasons: string[];
}

export interface Stage170NativeTitleOwnerDisposition {
  classification: Stage170NativeTitleOwnerClass;
  candidate: NativeTitleOwnerBridgeCandidate | null;
  reasons: string[];
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function firstPageLines(snapshot: DocumentSnapshot): string[] {
  return (snapshot.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 16);
}

function alphaTokenCount(value: string): number {
  return value.match(/[A-Za-z]{2,}/g)?.length ?? 0;
}

function titleLineAllowed(line: string): boolean {
  if (!line || alphaTokenCount(line) < 2) return false;
  if (/^(vol\.|issn|orcid|doi|abstract|keywords)\b/i.test(line)) return false;
  if (/^\d{4}$/.test(line)) return false;
  if (/@/.test(line)) return false;
  if (/^(jessica|alex|nancy|cameron|john|sharyn)\b/i.test(line)) return false;
  if (/\b(author|contact|email|e-mail|center for justice|illinois criminal justice information authority)\b/i.test(line)) return false;
  return /^[A-Z]/.test(line);
}

export function extractNativeOwnerBridgeVisibleTitle(snapshot: DocumentSnapshot, filename = ''): string | null {
  const lines = firstPageLines(snapshot);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!titleLineAllowed(line)) continue;
    const parts = [line];
    for (let next = index + 1; next < Math.min(lines.length, index + 3); next += 1) {
      const nextLine = lines[next]!;
      if (!titleLineAllowed(nextLine)) break;
      parts.push(nextLine);
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (alphaTokenCount(text) >= 4 && !isWeakVisibleHeadingAnchorText(text, filename)) {
      return text;
    }
  }
  return null;
}

export function selectNativeTitleOwnerBridgeCandidate(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): NativeTitleOwnerBridgeCandidate | null {
  const visibleTitle = extractNativeOwnerBridgeVisibleTitle(snapshot, analysis.filename);
  if (!visibleTitle) return null;
  const raw = (snapshot.nativeTitleBtCandidates ?? [])
    .filter(candidate =>
      candidate.page === 0 &&
      Array.isArray(candidate.groupIndexes) &&
      candidate.groupIndexes.length > 0 &&
      candidate.groupIndexes.length <= 4 &&
      candidate.markedDepth <= 1 &&
      candidate.fontSize >= 18 &&
      candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE,
    )
    .sort((a, b) => b.score - a.score || b.fontSize - a.fontSize || (a.y ?? 9999) - (b.y ?? 9999))[0];
  if (!raw) return null;
  return {
    page: 0,
    groupIndexes: raw.groupIndexes,
    text: visibleTitle,
    score: raw.score,
    fontSize: raw.fontSize,
    x: raw.x,
    y: raw.y,
    reasons: [
      'page0',
      'visible_title_line',
      'native_bt_et_ownerless_title_group',
      `font_size:${raw.fontSize}`,
      `group_count:${raw.groupIndexes.length}`,
    ],
  };
}

export function classifyStage170NativeTitleOwnerBridge(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  options: { routeVolatile?: boolean; alreadyFixedControl?: boolean } = {},
): Stage170NativeTitleOwnerDisposition {
  if (options.alreadyFixedControl) {
    return { classification: 'already_fixed_control', candidate: null, reasons: ['control row already fixed'] };
  }
  if (options.routeVolatile) {
    return { classification: 'route_order_volatility', candidate: null, reasons: ['route/order volatile control row'] };
  }
  const heading = categoryScore(analysis, 'heading_structure');
  const treeHeadingCount = snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length;
  if (heading == null || heading > 0 || treeHeadingCount > 0 || snapshot.headings.length > 0) {
    return { classification: 'no_safe_anchor', candidate: null, reasons: [`heading_structure:${heading}`] };
  }
  if (analysis.pdfClass !== 'native_tagged' || snapshot.structureTree === null || snapshot.isTagged !== true) {
    return { classification: 'no_safe_anchor', candidate: null, reasons: [`not_native_tagged:${analysis.pdfClass}`] };
  }
  if (isOcrPageShell(snapshot, analysis)) {
    return { classification: 'no_safe_anchor', candidate: null, reasons: ['ocr_or_scanned_deferred'] };
  }
  if ((categoryScore(analysis, 'text_extractability') ?? 0) < 90) {
    return { classification: 'no_safe_anchor', candidate: null, reasons: ['text_extractability_not_strong'] };
  }
  if ((snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0) {
    return { classification: 'native_title_visual_or_link_risk', candidate: null, reasons: ['link_struct_parent_risk'] };
  }
  const existingOwner = (snapshot.mcidTextSpans ?? []).some(row => row.page === 0 && /\/(H1?|P|Span)\s*<</i.test(row.snippet));
  if (existingOwner) {
    return { classification: 'native_title_existing_mcid_owner_candidate', candidate: null, reasons: ['first_page_mcid_owner_exists'] };
  }
  const visibleTitle = extractNativeOwnerBridgeVisibleTitle(snapshot, analysis.filename);
  if (!visibleTitle) {
    return { classification: 'no_safe_anchor', candidate: null, reasons: ['no_safe_visible_title_line'] };
  }
  const candidate = selectNativeTitleOwnerBridgeCandidate(analysis, snapshot);
  if (!candidate) {
    return { classification: 'native_title_visible_but_unlocatable', candidate: null, reasons: ['visible_title_not_mapped_to_bt_et_group'] };
  }
  return {
    classification: 'native_title_bt_owner_bridge_candidate',
    candidate,
    reasons: ['visible_title_mapped_to_native_bt_et_group', ...candidate.reasons],
  };
}
