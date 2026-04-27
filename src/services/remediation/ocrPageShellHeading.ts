import { HEADING_BOOTSTRAP_MIN_SCORE } from '../../config.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import {
  extractFirstPageVisibleHeadingText,
  isOcrPageShell,
  isWeakVisibleHeadingAnchorText,
} from './visibleHeadingAnchor.js';

export type Stage129OcrPageShellClass =
  | 'ocr_page_shell_heading_candidate'
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

function findVisibleMcidMatch(
  snapshot: DocumentSnapshot,
  title: string,
): { mcid: number; mcids: number[]; text: string; matchedTokenCount: number } | null {
  const wanted = alphaTokens(title);
  if (wanted.length < 4) return null;
  const entries = (snapshot.mcidTextSpans ?? [])
    .filter(row => row.page === 0 && Number.isInteger(row.mcid))
    .flatMap(row => alphaTokens(row.resolvedText ?? row.snippet).map(token => ({
      token,
      mcid: row.mcid,
      text: cleanOcrShellText(row.resolvedText ?? ''),
    })));
  if (entries.length < wanted.length) return null;

  for (let start = 0; start < entries.length; start++) {
    if (!tokenMatches(wanted[0]!, entries[start]!.token)) continue;
    let matched = 0;
    let end = start;
    while (
      matched < wanted.length &&
      end < entries.length &&
      tokenMatches(wanted[matched]!, entries[end]!.token)
    ) {
      matched += 1;
      end += 1;
    }
    if (matched === wanted.length) {
      const matchedText = entries
        .slice(start, end)
        .map(entry => entry.text)
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const mcids = [...new Set(entries.slice(start, end).map(entry => entry.mcid))]
        .filter(value => Number.isInteger(value))
        .sort((a, b) => a - b);
      return {
        mcid: entries[start]!.mcid,
        mcids,
        text: matchedText || title,
        matchedTokenCount: matched,
      };
    }
  }
  return null;
}

function candidateScore(input: {
  title: string;
  matchedTokenCount: number;
  source: OcrPageShellHeadingSource;
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
    const match = findVisibleMcidMatch(snapshot, seed.text);
    if (!match) continue;
    const text = seed.text;
    if (isWeakVisibleHeadingAnchorText(text, '')) continue;
    const scored = candidateScore({
      title: text,
      matchedTokenCount: match.matchedTokenCount,
      source: seed.source,
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
