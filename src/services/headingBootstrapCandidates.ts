import {
  HEADING_BOOTSTRAP_MAX_TEXT_LEN,
  HEADING_BOOTSTRAP_MIN_SCORE,
  HEADING_BOOTSTRAP_RETRY_POOL_SIZE,
  HEADING_BOOTSTRAP_TITLE_MAX_WORDS,
  REMEDIATION_MAX_HEADING_CREATES,
} from '../config.js';
import type { DocumentSnapshot } from '../types.js';

export interface HeadingBootstrapCandidate {
  structRef: string;
  tag: string;
  text: string;
  page: number;
  bbox?: [number, number, number, number];
  score: number;
  reasons: string[];
}

const ALLOWED_TAGS = new Set(['P', 'SPAN', 'DIV']);
const MIN_TEXT_LEN = 4;

function normalizeTag(tag: string): string {
  return tag.replace(/^\//, '').toUpperCase();
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function wordCount(text: string): number {
  const trimmed = normalizeText(text);
  return trimmed ? trimmed.split(' ').length : 0;
}

function looksLikeRawUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(text.trim());
}

function rawUrlTokenRatio(text: string): number {
  const tokens = normalizeText(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return 0;
  const rawUrlTokens = tokens.filter(token => /^(https?:\/\/|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/)/.test(token)).length;
  return rawUrlTokens / tokens.length;
}

function looksLikeCaption(text: string): boolean {
  return /^(figure|fig\.|table|chart|graph|photo|image)\s+\d+[:.\- ]/i.test(text.trim());
}

function looksLikeBodyParagraph(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length > HEADING_BOOTSTRAP_MAX_TEXT_LEN) return true;
  if (wordCount(normalized) > HEADING_BOOTSTRAP_TITLE_MAX_WORDS + 6) return true;
  if (/[.!?;:]\s+\S/.test(normalized) && wordCount(normalized) > 10) return true;
  return false;
}

function looksLikeTableLine(text: string): boolean {
  return /\t|\s{4,}|\|/.test(text);
}

function isTitleCaseLike(text: string): boolean {
  const words = normalizeText(text).split(' ').filter(Boolean);
  if (words.length === 0 || words.length > HEADING_BOOTSTRAP_TITLE_MAX_WORDS) return false;
  const alphaWords = words.filter(word => /[A-Za-z]/.test(word));
  if (alphaWords.length === 0) return false;
  const matches = alphaWords.filter(word => /^[A-Z][A-Za-z0-9'’/-]*$/.test(word)).length;
  return matches >= Math.ceil(alphaWords.length * 0.6);
}

function isAllCapsLike(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return caps / letters.length >= 0.85;
}

function bboxTopScore(bbox?: [number, number, number, number]): number {
  if (!bbox) return 0;
  const top = bbox[3];
  if (top >= 650) return 25;
  if (top >= 500) return 15;
  if (top >= 350) return 8;
  return 0;
}

function bboxIsolationScore(bbox?: [number, number, number, number]): number {
  if (!bbox) return 0;
  const width = Math.max(0, bbox[2] - bbox[0]);
  const height = Math.max(0, bbox[3] - bbox[1]);
  if (width <= 0 || height <= 0) return 0;
  if (height >= 16 && width <= 420) return 10;
  if (height >= 12 && width <= 500) return 6;
  return 0;
}

export function scoreHeadingBootstrapCandidate(
  row: NonNullable<DocumentSnapshot['paragraphStructElems']>[number],
): HeadingBootstrapCandidate | null {
  const tag = normalizeTag(row.tag);
  if (!ALLOWED_TAGS.has(tag)) return null;
  const text = normalizeText(row.text);
  if (text.length < MIN_TEXT_LEN || text.length > HEADING_BOOTSTRAP_MAX_TEXT_LEN) return null;
  if (looksLikeRawUrl(text) || rawUrlTokenRatio(text) >= 0.5) return null;
  if (looksLikeCaption(text) || looksLikeTableLine(text) || looksLikeBodyParagraph(text)) return null;

  let score = 0;
  const reasons: string[] = [];

  if (row.page === 0) {
    score += 35;
    reasons.push('page0');
  } else if (row.page <= 2) {
    score += 18;
    reasons.push('early_page');
  }

  const words = wordCount(text);
  if (words <= HEADING_BOOTSTRAP_TITLE_MAX_WORDS) {
    score += 22;
    reasons.push('compact_phrase');
  }
  if (text.length >= 8 && text.length <= 80) {
    score += 18;
    reasons.push('title_length');
  }
  if (!/[.!?]$/.test(text)) {
    score += 6;
    reasons.push('no_sentence_punctuation');
  }
  if (isTitleCaseLike(text)) {
    score += 28;
    reasons.push('title_case');
  }
  if (isAllCapsLike(text)) {
    score += 24;
    reasons.push('all_caps');
  }

  const top = bboxTopScore(row.bbox);
  if (top > 0) {
    score += top;
    reasons.push('top_of_page');
  }
  const isolated = bboxIsolationScore(row.bbox);
  if (isolated > 0) {
    score += isolated;
    reasons.push('isolated_bbox');
  }

  return {
    structRef: row.structRef,
    tag,
    text,
    page: row.page,
    ...(row.bbox ? { bbox: row.bbox } : {}),
    score,
    reasons,
  };
}

export function buildHeadingBootstrapCandidates(snapshot: DocumentSnapshot): HeadingBootstrapCandidate[] {
  const scored = (snapshot.paragraphStructElems ?? [])
    .map(scoreHeadingBootstrapCandidate)
    .filter((row): row is HeadingBootstrapCandidate => row !== null)
    .sort((a, b) => b.score - a.score || a.page - b.page || a.text.length - b.text.length);

  const seen = new Set<string>();
  const unique: HeadingBootstrapCandidate[] = [];
  for (const row of scored) {
    if (seen.has(row.structRef)) continue;
    seen.add(row.structRef);
    unique.push(row);
  }
  return unique;
}

export function buildEligibleHeadingBootstrapCandidates(snapshot: DocumentSnapshot): HeadingBootstrapCandidate[] {
  const retryPoolSize = Math.max(
    1,
    Math.min(
      HEADING_BOOTSTRAP_RETRY_POOL_SIZE,
      REMEDIATION_MAX_HEADING_CREATES,
    ),
  );
  return buildHeadingBootstrapCandidates(snapshot)
    .filter(candidate => candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE)
    .slice(0, retryPoolSize);
}

export function selectHeadingBootstrapCandidate(snapshot: DocumentSnapshot): HeadingBootstrapCandidate | null {
  return buildEligibleHeadingBootstrapCandidates(snapshot)[0] ?? null;
}

export function selectHeadingBootstrapCandidateForAttempt(
  snapshot: DocumentSnapshot,
  attemptIndex = 0,
): HeadingBootstrapCandidate | null {
  const ranked = buildEligibleHeadingBootstrapCandidates(snapshot);
  if (attemptIndex < 0 || attemptIndex >= ranked.length) return null;
  return ranked[attemptIndex] ?? null;
}
