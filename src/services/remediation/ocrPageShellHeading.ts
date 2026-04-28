import { HEADING_BOOTSTRAP_MIN_SCORE } from '../../config.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import {
  extractFirstPageVisibleHeadingText,
  isOcrPageShell,
  isWeakVisibleHeadingAnchorText,
} from './visibleHeadingAnchor.js';

export type Stage129OcrPageShellClass =
  | 'ocr_page_shell_heading_candidate'
  | 'ocr_page_shell_reading_order_candidate'
  | 'ocr_text_without_safe_anchor'
  | 'ocr_reading_order_shell_debt'
  | 'scanned_no_extractable_text_defer'
  | 'native_structure_not_ocr';

export type OcrPageShellHeadingSource =
  | 'metadata_visible_match'
  | 'filename_visible_match'
  | 'first_page_visible_line';

export interface OcrPageShellHeadingCandidate {
  page: number;
  mcid: number;
  mcids: number[];
  text: string;
  source: OcrPageShellHeadingSource;
  score: number;
  reasons: string[];
}

export interface Stage129OcrPageShellDisposition {
  classification: Stage129OcrPageShellClass;
  candidate: OcrPageShellHeadingCandidate | null;
  reasons: string[];
}

export interface OcrPageShellHeadingSeedDebug {
  text: string;
  source: OcrPageShellHeadingSource;
  tokens: string[];
  exactMatch: boolean;
  windowMatch: boolean;
  matchedTokenCount: number;
  mcids: number[];
  score: number | null;
  reasons: string[];
}

export interface OcrPageShellHeadingDebug {
  seeds: OcrPageShellHeadingSeedDebug[];
  firstPageLineCandidates: string[];
  firstPageMcidSpanSamples: Array<{ mcid: number; text: string }>;
  paragraphSamples: Array<{ page: number; text: string; structRef?: string }>;
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

export function cleanOcrShellText(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCandidateText(value: string): string {
  return cleanOcrShellText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPdfExtension(value: string): string {
  return value.replace(/\.pdf$/i, '');
}

function lastPathSegment(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value;
}

function stripLeadingDocumentId(value: string): string {
  return value
    .replace(/^(?:manual\s+scanned|manual_scanned|scanned|ocr)\s+/i, '')
    .replace(/^\d{3,6}\s+/, '')
    .trim();
}

function displayTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (/^\d+(?:[./]\d+)?$/.test(word)) return word;
      if (word.length <= 2) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function alphaTokens(value: string): string[] {
  return cleanOcrShellText(value)
    .toLowerCase()
    .match(/[a-z]+/g) ?? [];
}

const TITLE_STOPWORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

function displayToken(value: string): string {
  return value.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

function isTitlePrefixToken(value: string, index: number): boolean {
  const token = displayToken(value);
  if (!token) return false;
  const lower = token.toLowerCase();
  if (index > 0 && TITLE_STOPWORDS.has(lower)) return true;
  if (/^[A-Z][A-Za-z0-9'’-]*$/.test(token)) return true;
  if (/^[A-Z]{2,}$/.test(token)) return true;
  return false;
}

function titlePrefixSeedsFromFirstPageText(snapshot: DocumentSnapshot, filename: string): string[] {
  const raw = cleanOcrShellText(snapshot.textByPage[0] ?? '');
  if (!raw || /^[^A-Za-z]*\d/.test(raw)) return [];
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 16);
  if (words.length < 4 || !isTitlePrefixToken(words[0]!, 0)) return [];
  const candidates: string[] = [];
  for (let length = 4; length <= Math.min(10, words.length); length += 1) {
    const slice = words.slice(0, length);
    const last = displayToken(slice[slice.length - 1]!).toLowerCase();
    if (TITLE_STOPWORDS.has(last)) continue;
    if (!slice.every((word, index) => isTitlePrefixToken(word, index))) continue;
    const text = slice.map(displayToken).join(' ');
    if (!isWeakVisibleHeadingAnchorText(text, filename)) candidates.push(text);
  }
  return candidates;
}

function seedFromRaw(raw: string | undefined | null): string | null {
  const segment = stripLeadingDocumentId(normalizeCandidateText(stripPdfExtension(lastPathSegment(raw ?? ''))));
  if (!segment || alphaTokens(segment).length < 4) return null;
  const display = displayTitleCase(segment);
  if (isWeakVisibleHeadingAnchorText(display, '')) return null;
  return display;
}

function candidateSeeds(analysis: AnalysisResult, snapshot: DocumentSnapshot): Array<{ text: string; source: OcrPageShellHeadingSource }> {
  const seen = new Set<string>();
  const out: Array<{ text: string; source: OcrPageShellHeadingSource }> = [];
  const add = (text: string | null, source: OcrPageShellHeadingSource) => {
    if (!text) return;
    const key = alphaTokens(text).join(' ');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ text, source });
  };

  add(seedFromRaw(snapshot.metadata.title), 'metadata_visible_match');
  add(seedFromRaw(analysis.filename), 'filename_visible_match');

  const visible = extractFirstPageVisibleHeadingText(snapshot, analysis.filename);
  if (visible) add(visible, 'first_page_visible_line');
  for (const text of titlePrefixSeedsFromFirstPageText(snapshot, analysis.filename)) {
    add(text, 'first_page_visible_line');
  }
  return out;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatches(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  if (expected.length >= 5 && actual.length >= 5) return editDistanceAtMostOne(expected, actual);
  return false;
}

interface OcrMcidTokenEntry {
  token: string;
  mcid: number;
  text: string;
}

interface OcrMcidTokenMatch {
  mcid: number;
  mcids: number[];
  text: string;
  matchedTokenCount: number;
  exact: boolean;
}

function mcidTokenEntries(snapshot: DocumentSnapshot): OcrMcidTokenEntry[] {
  return (snapshot.mcidTextSpans ?? [])
    .filter(row => row.page === 0 && Number.isInteger(row.mcid))
    .flatMap(row => alphaTokens(row.resolvedText ?? row.snippet).map(token => ({
      token,
      mcid: row.mcid,
      text: cleanOcrShellText(row.resolvedText ?? ''),
    })));
}

function matchWantedTokensAt(
  wanted: string[],
  entries: OcrMcidTokenEntry[],
  wantedStart: number,
  entryStart: number,
): { matched: number; endEntry: number } {
  let matched = 0;
  let entryIndex = entryStart;
  while (wantedStart + matched < wanted.length && entryIndex < entries.length) {
    const expected = wanted[wantedStart + matched]!;
    const current = entries[entryIndex]!;
    if (tokenMatches(expected, current.token)) {
      matched += 1;
      entryIndex += 1;
      continue;
    }
    const next = entries[entryIndex + 1];
    if (next && tokenMatches(expected, `${current.token}${next.token}`)) {
      matched += 1;
      entryIndex += 2;
      continue;
    }
    break;
  }
  return { matched, endEntry: entryIndex };
}

function matchToVisibleText(entries: OcrMcidTokenEntry[], start: number, end: number, fallback: string): string {
  return entries
    .slice(start, end)
    .map(entry => entry.text)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

function matchToMcids(entries: OcrMcidTokenEntry[], start: number, end: number): number[] {
  return [...new Set(entries.slice(start, end).map(entry => entry.mcid))]
    .filter(value => Number.isInteger(value))
    .sort((a, b) => a - b);
}

function findVisibleMcidMatch(
  snapshot: DocumentSnapshot,
  title: string,
): OcrMcidTokenMatch | null {
  const wanted = alphaTokens(title);
  if (wanted.length < 4) return null;
  const entries = mcidTokenEntries(snapshot);
  if (entries.length < wanted.length) return null;

  for (let start = 0; start < entries.length; start++) {
    const { matched, endEntry } = matchWantedTokensAt(wanted, entries, 0, start);
    if (matched === wanted.length) {
      const mcids = matchToMcids(entries, start, endEntry);
      return {
        mcid: entries[start]!.mcid,
        mcids,
        text: matchToVisibleText(entries, start, endEntry, title),
        matchedTokenCount: matched,
        exact: true,
      };
    }
  }
  return null;
}

function findVisibleMcidWindowMatch(
  snapshot: DocumentSnapshot,
  title: string,
): OcrMcidTokenMatch | null {
  const wanted = alphaTokens(title);
  if (wanted.length < 5) return null;
  const entries = mcidTokenEntries(snapshot);
  if (entries.length < 4) return null;
  let best: { start: number; end: number; matched: number; wantedStart: number } | null = null;
  for (let entryStart = 0; entryStart < entries.length; entryStart += 1) {
    for (let wantedStart = 0; wantedStart < wanted.length; wantedStart += 1) {
      const { matched, endEntry } = matchWantedTokensAt(wanted, entries, wantedStart, entryStart);
      if (matched < 4) continue;
      if (!best || matched > best.matched || (matched === best.matched && wantedStart < best.wantedStart)) {
        best = { start: entryStart, end: endEntry, matched, wantedStart };
      }
    }
  }
  if (!best) return null;
  const coverage = best.matched / wanted.length;
  if (best.matched < 4 || coverage < 0.6) return null;
  const text = matchToVisibleText(entries, best.start, best.end, '');
  if (isWeakVisibleHeadingAnchorText(text, '')) return null;
  const mcids = matchToMcids(entries, best.start, best.end);
  if (mcids.length <= 0) return null;
  return {
    mcid: entries[best.start]!.mcid,
    mcids,
    text,
    matchedTokenCount: best.matched,
    exact: false,
  };
}

function candidateScore(input: {
  title: string;
  matchedTokenCount: number;
  source: OcrPageShellHeadingSource;
  exactVisibleMatch?: boolean;
}): { score: number; reasons: string[] } {
  const tokens = alphaTokens(input.title);
  let score = 34;
  const reasons = ['ocr_page_shell', 'visible_page0_mcid_match'];
  if (input.source === 'metadata_visible_match') {
    score += 14;
    reasons.push('metadata_title_visible_match');
  }
  if (input.source === 'filename_visible_match') {
    score += 8;
    reasons.push('filename_title_visible_match');
  }
  if (input.matchedTokenCount >= 5) {
    score += 12;
    reasons.push('multi_word_title_match');
  }
  if (input.exactVisibleMatch === false) {
    reasons.push('line_aware_visible_title_window');
  }
  if (tokens.length >= 4 && tokens.length <= 14) {
    score += 12;
    reasons.push('compact_title');
  }
  if (cleanOcrShellText(input.title).length <= 120) {
    score += 8;
    reasons.push('title_length');
  }
  return { score, reasons };
}

export function selectOcrPageShellHeadingCandidate(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): OcrPageShellHeadingCandidate | null {
  if (!isOcrPageShell(snapshot, analysis)) return null;
  if ((categoryScore(analysis, 'heading_structure') ?? 100) > 0) return null;
  if ((categoryScore(analysis, 'text_extractability') ?? 0) < 60) return null;
  if ((snapshot.mcidTextSpans?.length ?? 0) <= 0) return null;
  if (snapshot.headings.length > 0 || (snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? 0) > 0) return null;

  for (const seed of candidateSeeds(analysis, snapshot)) {
    const match = findVisibleMcidMatch(snapshot, seed.text) ?? findVisibleMcidWindowMatch(snapshot, seed.text);
    if (!match) continue;
    const text = match.exact ? seed.text : match.text;
    if (isWeakVisibleHeadingAnchorText(text, '')) continue;
    const scored = candidateScore({
      title: text,
      matchedTokenCount: match.matchedTokenCount,
      source: seed.source,
      exactVisibleMatch: match.exact,
    });
    if (scored.score < HEADING_BOOTSTRAP_MIN_SCORE) continue;
    return {
      page: 0,
      mcid: match.mcid,
      mcids: match.mcids,
      text: text.slice(0, 200),
      source: seed.source,
      score: scored.score,
      reasons: scored.reasons,
    };
  }
  return null;
}

export function debugOcrPageShellHeadingSelection(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): OcrPageShellHeadingDebug {
  const seeds = candidateSeeds(analysis, snapshot).map(seed => {
    const exact = findVisibleMcidMatch(snapshot, seed.text);
    const window = exact ? null : findVisibleMcidWindowMatch(snapshot, seed.text);
    const match = exact ?? window;
    const text = match?.exact === false ? match.text : seed.text;
    const scored = match && !isWeakVisibleHeadingAnchorText(text, '')
      ? candidateScore({
        title: text,
        matchedTokenCount: match.matchedTokenCount,
        source: seed.source,
        exactVisibleMatch: match.exact,
      })
      : null;
    return {
      text: seed.text,
      source: seed.source,
      tokens: alphaTokens(seed.text),
      exactMatch: Boolean(exact),
      windowMatch: Boolean(window),
      matchedTokenCount: match?.matchedTokenCount ?? 0,
      mcids: match?.mcids ?? [],
      score: scored?.score ?? null,
      reasons: scored?.reasons ?? [],
    };
  });
  return {
    seeds,
    firstPageLineCandidates: [
      extractFirstPageVisibleHeadingText(snapshot, analysis.filename),
      ...titlePrefixSeedsFromFirstPageText(snapshot, analysis.filename),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0),
    firstPageMcidSpanSamples: (snapshot.mcidTextSpans ?? [])
      .filter(row => row.page === 0 && Number.isInteger(row.mcid))
      .slice(0, 24)
      .map(row => ({ mcid: row.mcid, text: cleanOcrShellText(row.resolvedText ?? row.snippet).slice(0, 120) })),
    paragraphSamples: (snapshot.paragraphStructElems ?? [])
      .filter(row => row.page === 0)
      .slice(0, 8)
      .map(row => ({
        page: row.page,
        text: cleanOcrShellText(row.text).slice(0, 200),
        structRef: row.structRef,
      })),
  };
}

export function classifyStage129OcrPageShell(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage129OcrPageShellDisposition {
  if (!isOcrPageShell(snapshot, analysis)) {
    return { classification: 'native_structure_not_ocr', candidate: null, reasons: ['not_ocr_page_shell'] };
  }
  if (snapshot.textCharCount <= 0 || (categoryScore(analysis, 'text_extractability') ?? 0) < 60) {
    return { classification: 'scanned_no_extractable_text_defer', candidate: null, reasons: ['no_extractable_ocr_text'] };
  }
  const candidate = selectOcrPageShellHeadingCandidate(analysis, snapshot);
  if (candidate) {
    return { classification: 'ocr_page_shell_heading_candidate', candidate, reasons: ['safe_visible_ocr_anchor', ...candidate.reasons] };
  }
  if (shouldTryOcrPageShellReadingOrderRecovery(analysis, snapshot)) {
    return {
      classification: 'ocr_page_shell_reading_order_candidate',
      candidate: null,
      reasons: ['ocr_page_shell_degenerate_reading_order', 'engine_ocr_text_blocks_present'],
    };
  }
  if ((categoryScore(analysis, 'heading_structure') ?? 100) <= 0) {
    return { classification: 'ocr_text_without_safe_anchor', candidate: null, reasons: ['heading_zero_no_safe_visible_anchor'] };
  }
  if ((categoryScore(analysis, 'reading_order') ?? 100) < 60) {
    return { classification: 'ocr_reading_order_shell_debt', candidate: null, reasons: ['reading_order_shell_debt'] };
  }
  return { classification: 'ocr_text_without_safe_anchor', candidate: null, reasons: ['no_safe_visible_anchor'] };
}

export function shouldTryOcrPageShellHeadingRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  return classifyStage129OcrPageShell(analysis, snapshot).classification === 'ocr_page_shell_heading_candidate';
}

export function shouldTryOcrPageShellReadingOrderRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  if (!isOcrPageShell(snapshot, analysis)) return false;
  if (snapshot.textCharCount <= 0 || (categoryScore(analysis, 'text_extractability') ?? 0) < 60) return false;
  if ((categoryScore(analysis, 'reading_order') ?? 100) >= 95) return false;
  if ((categoryScore(analysis, 'heading_structure') ?? 0) <= 0 && snapshot.headings.length <= 0) return false;
  if (snapshot.structureTree === null || (snapshot.paragraphStructElems?.length ?? 0) < Math.min(3, Math.max(1, snapshot.pageCount))) return false;
  if ((snapshot.mcidTextSpans?.length ?? 0) <= 0) return false;
  if (snapshot.remediationProvenance?.engineAppliedOcr !== true) return false;
  if (snapshot.remediationProvenance?.engineTaggedOcrText !== true) return false;
  const reading = snapshot.detectionProfile?.readingOrderSignals;
  if (reading?.headerFooterPollutionRisk === true) return false;
  if ((reading?.annotationOrderRiskCount ?? 0) > 0 || (reading?.annotationStructParentRiskCount ?? 0) > 0) return false;
  if ((snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0) return false;
  if ((snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0) return false;
  return (reading?.degenerateStructureTree === true) || ((reading?.structureTreeDepth ?? 0) <= 2 && snapshot.pageCount > 1);
}
