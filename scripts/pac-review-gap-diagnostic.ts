#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot, ScoredCategory } from '../src/types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_PDF_DIR = 'Output/review-five-a-pdfs-2026-05-08-r1/pdfs';
const DEFAULT_PAC_REPORT_DIR = 'Output/review-five-a-pdfs-2026-05-08-r1/PAC Reports';
const DEFAULT_OUT = 'Output/review-five-a-pdfs-2026-05-08-r1/pac-gap-diagnostic';

export type PacReportBucket =
  | 'PDF Syntax'
  | 'Fonts'
  | 'Content'
  | 'Embedded Files'
  | 'Natural language'
  | 'Structure elements'
  | 'Structure tree'
  | 'Role mapping'
  | 'Alternative Descriptions'
  | 'Metadata'
  | 'Document settings'
  | 'Basic Requirements';

const PAC_BUCKETS: PacReportBucket[] = [
  'PDF Syntax',
  'Fonts',
  'Content',
  'Embedded Files',
  'Natural language',
  'Structure elements',
  'Structure tree',
  'Role mapping',
  'Alternative Descriptions',
  'Metadata',
  'Document settings',
  'Basic Requirements',
];

const PAC_BUCKET_SET = new Set<string>(PAC_BUCKETS);

const RULE_PREFIX_BY_BUCKET: Record<PacReportBucket, string[]> = {
  'PDF Syntax': ['pdfua.parent_tree.', 'pdfua.structure.', 'pdfua.content.'],
  Fonts: ['pdfua.font.', 'pdfua.content.characters_unicode_mappable'],
  Content: ['pdfua.content.', 'pdfua.font.'],
  'Embedded Files': ['pdfua.filespec.', 'pdfua.optional_content.', 'pdfua.xfa.'],
  'Natural language': ['pdfua.language.'],
  'Structure elements': ['pdfua.figure.', 'pdfua.table.', 'pdfua.list.', 'pdfua.annotations.', 'pdfua.toc.', 'pdfua.note.'],
  'Structure tree': ['pdfua.parent_tree.', 'pdfua.structure.'],
  'Role mapping': ['pdfua.structure.rolemap'],
  'Alternative Descriptions': ['pdfua.figure.alt_', 'pdfua.figure.checker_', 'pdfua.form.tu_', 'pdfua.annotation.alt_', 'pdfua.quality.alt_'],
  Metadata: ['pdfua.metadata.', 'pdfua.quality.title_'],
  'Document settings': ['pdfua.settings.'],
  'Basic Requirements': ['pdfua.metadata.', 'pdfua.settings.', 'pdfua.language.', 'pdfua.structure.struct_tree_present'],
};

const FAMILY_BY_BUCKET: Record<PacReportBucket, string[]> = {
  'PDF Syntax': ['ParentTree/object syntax', 'structure syntax', 'tagged-content syntax'],
  Fonts: ['font CMap/ToUnicode', 'Unicode mapping'],
  Content: ['PAC event-level content tagging', 'artifact/tag nesting', 'Unicode mapping'],
  'Embedded Files': ['file specs', 'optional content', 'XFA'],
  'Natural language': ['document and object language'],
  'Structure elements': ['figures', 'tables', 'lists', 'headings', 'annotations', 'TOC/Note'],
  'Structure tree': ['ParentTree integrity', 'structure element syntax', 'RoleMap'],
  'Role mapping': ['RoleMap catalog'],
  'Alternative Descriptions': ['alt text', 'figure/form/annotation descriptions'],
  Metadata: ['metadata/title'],
  'Document settings': ['MarkInfo/View preferences'],
  'Basic Requirements': ['core PDF/UA prerequisites'],
};

export interface PacReportBucketCounts {
  bucket: PacReportBucket;
  passed: number | null;
  warned: number | null;
  failed: number | null;
}

export interface PacReportSummary {
  filename: string | null;
  compliant: boolean | null;
  buckets: PacReportBucketCounts[];
}

export interface PacReviewCategorySnapshot {
  key: CategoryKey;
  score: number | null;
  applicable: boolean;
}

export interface PacBucketGapRow {
  bucket: PacReportBucket;
  pacFailed: number;
  pacWarned: number;
  likelyFamilies: string[];
  categoryScores: PacReviewCategorySnapshot[];
  matchingRuleFailures: PacRuleEvidence[];
  matchingRuleWarnings: PacRuleEvidence[];
  likelyMissingCheckerFamily: string;
}

export interface PacReviewFileRow {
  id: string;
  pdf: string;
  pacReport: string | null;
  score: number | null;
  grade: string | null;
  categories: PacReviewCategorySnapshot[];
  pac: PacReportSummary | null;
  bucketGaps: PacBucketGapRow[];
  pacRuleFailures: PacRuleEvidence[];
  pacRuleWarnings: PacRuleEvidence[];
  analyzerAudits: Record<string, unknown>;
  error?: string;
}

export interface PacReviewDiagnostic {
  generatedAt: string;
  files: PacReviewFileRow[];
  failedBucketTotals: Array<{ bucket: PacReportBucket; failed: number; warned: number; files: number }>;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberToken(value: string | undefined): number | null {
  if (!value || value === '-') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumberish(value: string | undefined): boolean {
  return value === '-' || Boolean(value && /^[0-9][0-9,]*$/.test(value));
}

function compactLines(text: string): string[] {
  return text
    .replace(/\f/g, '\n')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function readTriple(tokens: string[], index: number): PacReportBucketCounts | null {
  if (!isNumberish(tokens[index]) || !isNumberish(tokens[index + 1]) || !isNumberish(tokens[index + 2])) return null;
  return {
    bucket: 'Content',
    passed: numberToken(tokens[index]),
    warned: numberToken(tokens[index + 1]),
    failed: numberToken(tokens[index + 2]),
  };
}

export function parsePacReportText(text: string): PacReportSummary {
  const lines = compactLines(text);
  const filenameIndex = lines.findIndex(line => line.toLowerCase() === 'filename');
  const filename = filenameIndex >= 0 ? lines[filenameIndex + 1] ?? null : null;
  const resultLine = lines.find(line => line.includes('PDF/UA compliant'));
  const compliant = resultLine ? !resultLine.toLowerCase().includes('not pdf/ua compliant') : null;
  const headerIndex = lines.findIndex(line => line === 'CHECKPOINT');
  const aboutIndex = lines.findIndex(line => line === 'ABOUT PAC');
  const tokens = lines.slice(headerIndex >= 0 ? headerIndex + 1 : 0, aboutIndex >= 0 ? aboutIndex : lines.length)
    .filter(line => !['PASSED', 'WARNED', 'FAILED', 'Logical structure', 'Metadata and Settings'].includes(line));
  const byBucket = new Map<PacReportBucket, PacReportBucketCounts>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as PacReportBucket;
    if (!PAC_BUCKET_SET.has(token)) continue;
    const triple = readTriple(tokens, i + 1);
    if (!triple) continue;
    byBucket.set(token, { ...triple, bucket: token });
  }

  const firstNamedIndex = tokens.findIndex(token => PAC_BUCKET_SET.has(token));
  const leading = tokens.slice(0, firstNamedIndex >= 0 ? firstNamedIndex : 0);
  const leadingTriples: PacReportBucketCounts[] = [];
  for (let i = 0; i + 2 < leading.length; i += 3) {
    const triple = readTriple(leading, i);
    if (triple) leadingTriples.push(triple);
  }
  const leadingBuckets: PacReportBucket[] = leadingTriples.length === 3
    ? ['PDF Syntax', 'Fonts', 'Content']
    : ['Basic Requirements', 'PDF Syntax', 'Fonts', 'Content'];
  leadingTriples.forEach((triple, index) => {
    const bucket = leadingBuckets[index];
    if (bucket && !byBucket.has(bucket)) byBucket.set(bucket, { ...triple, bucket });
  });

  const fontsIndex = tokens.indexOf('Fonts');
  const embeddedIndex = tokens.indexOf('Embedded Files');
  if (fontsIndex >= 0 && embeddedIndex > fontsIndex && !byBucket.has('Content')) {
    const between = tokens.slice(fontsIndex + 4, embeddedIndex).filter(token => !PAC_BUCKET_SET.has(token));
    for (let i = 0; i + 2 < between.length; i += 1) {
      const triple = readTriple(between, i);
      if (triple) {
        byBucket.set('Content', { ...triple, bucket: 'Content' });
        break;
      }
    }
  }

  const roleIndex = tokens.indexOf('Role mapping');
  const metadataIndex = tokens.indexOf('Metadata');
  if (roleIndex >= 0 && metadataIndex > roleIndex && !byBucket.has('Alternative Descriptions')) {
    const between = tokens.slice(roleIndex + 1, metadataIndex).filter(token => !PAC_BUCKET_SET.has(token));
    const triples: PacReportBucketCounts[] = [];
    for (let i = 0; i + 2 < between.length; i += 1) {
      const triple = readTriple(between, i);
      if (triple) triples.push(triple);
    }
    const altTriple = triples.at(-1);
    if (altTriple) {
      byBucket.set('Alternative Descriptions', { ...altTriple, bucket: 'Alternative Descriptions' });
    }
  }

  return {
    filename,
    compliant,
    buckets: PAC_BUCKETS
      .filter(bucket => byBucket.has(bucket))
      .map(bucket => byBucket.get(bucket)!),
  };
}

export function categorySnapshots(categories: ScoredCategory[]): PacReviewCategorySnapshot[] {
  return categories
    .map(category => ({
      key: category.key,
      score: typeof category.score === 'number' ? category.score : null,
      applicable: category.applicable !== false,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function scoreValue(analysis: AnalysisResult): number | null {
  return analysis.scoreProfile?.overallScore ?? analysis.score ?? null;
}

function matchingRules(bucket: PacReportBucket, rules: PacRuleEvidence[], statuses: Array<PacRuleEvidence['status']>): PacRuleEvidence[] {
  const prefixes = RULE_PREFIX_BY_BUCKET[bucket];
  return rules
    .filter(rule => statuses.includes(rule.status) && prefixes.some(prefix => rule.ruleId.startsWith(prefix)))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function categoriesForBucket(bucket: PacReportBucket, categories: PacReviewCategorySnapshot[]): PacReviewCategorySnapshot[] {
  const keysByBucket: Partial<Record<PacReportBucket, CategoryKey[]>> = {
    'PDF Syntax': ['pdf_ua_compliance', 'reading_order'],
    Fonts: ['text_extractability'],
    Content: ['pdf_ua_compliance', 'reading_order', 'text_extractability'],
    'Embedded Files': ['pdf_ua_compliance', 'form_accessibility'],
    'Natural language': ['title_language', 'alt_text', 'link_quality', 'form_accessibility'],
    'Structure elements': ['pdf_ua_compliance', 'table_markup', 'alt_text', 'reading_order', 'heading_structure', 'link_quality'],
    'Structure tree': ['pdf_ua_compliance', 'reading_order'],
    'Role mapping': ['pdf_ua_compliance'],
    'Alternative Descriptions': ['alt_text', 'form_accessibility', 'link_quality'],
    Metadata: ['title_language'],
    'Document settings': ['pdf_ua_compliance', 'title_language'],
    'Basic Requirements': ['pdf_ua_compliance', 'title_language'],
  };
  const keys = keysByBucket[bucket] ?? [];
  return categories.filter(category => keys.includes(category.key));
}

export function buildBucketGaps(
  pac: PacReportSummary,
  rules: PacRuleEvidence[],
  categories: PacReviewCategorySnapshot[],
): PacBucketGapRow[] {
  return pac.buckets
    .filter(bucket => (bucket.failed ?? 0) > 0 || (bucket.warned ?? 0) > 0)
    .map(bucket => {
      const failures = matchingRules(bucket.bucket, rules, ['fail']);
      const warnings = matchingRules(bucket.bucket, rules, ['warn']);
      return {
        bucket: bucket.bucket,
        pacFailed: bucket.failed ?? 0,
        pacWarned: bucket.warned ?? 0,
        likelyFamilies: FAMILY_BY_BUCKET[bucket.bucket],
        categoryScores: categoriesForBucket(bucket.bucket, categories),
        matchingRuleFailures: failures,
        matchingRuleWarnings: warnings,
        likelyMissingCheckerFamily: failures.length === 0
          ? `PAC has ${bucket.bucket} debt not represented by a matching internal failed rule.`
          : 'Internal PAC evidence has matching failed rule rows; inspect object-level counts before remediation.',
      };
    })
    .sort((a, b) => b.pacFailed - a.pacFailed || a.bucket.localeCompare(b.bucket));
}

export function collectAnalyzerAudits(snapshot: DocumentSnapshot): Record<string, unknown> {
  return {
    parentTreeAudit: snapshot.parentTreeAudit ?? null,
    contentTaggingAudit: snapshot.contentTaggingAudit ?? null,
    structureSyntaxAudit: snapshot.structureSyntaxAudit ?? null,
    fontSyntaxAudit: snapshot.fontSyntaxAudit ?? null,
    tableHeaderAudit: snapshot.tableHeaderAudit ?? null,
    listStructureAudit: snapshot.listStructureAudit ?? null,
    languageAudit: snapshot.languageAudit ?? null,
    renderedContrastAudit: snapshot.renderedContrastAudit ?? null,
    aiVisualTagAudit: snapshot.aiVisualTagAudit ?? null,
  };
}

export function buildPacReviewDiagnostic(rows: PacReviewFileRow[]): PacReviewDiagnostic {
  const totals = new Map<PacReportBucket, { bucket: PacReportBucket; failed: number; warned: number; files: number }>();
  for (const file of rows) {
    for (const gap of file.bucketGaps) {
      const row = totals.get(gap.bucket) ?? { bucket: gap.bucket, failed: 0, warned: 0, files: 0 };
      row.failed += gap.pacFailed;
      row.warned += gap.pacWarned;
      row.files += 1;
      totals.set(gap.bucket, row);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    files: rows.sort((a, b) => a.id.localeCompare(b.id)),
    failedBucketTotals: [...totals.values()].sort((a, b) => b.failed - a.failed || a.bucket.localeCompare(b.bucket)),
  };
}

function mdEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function categoryCell(categories: PacReviewCategorySnapshot[]): string {
  return categories.map(category => `${category.key}:${category.applicable ? category.score ?? 'n/a' : 'n/a'}`).join('<br>');
}

function ruleCell(rules: PacRuleEvidence[]): string {
  if (rules.length === 0) return '-';
  return rules.slice(0, 8).map(rule => `${rule.ruleId}${rule.count !== undefined ? ` (${rule.count})` : ''}`).join('<br>');
}

export function renderPacReviewMarkdown(diagnostic: PacReviewDiagnostic): string {
  const lines: string[] = [
    '# PAC Review Gap Diagnostic',
    '',
    `Generated: ${diagnostic.generatedAt}`,
    '',
    '## Failed/Warned PAC Buckets',
    '',
    '| Bucket | Files | PAC Failed | PAC Warned |',
    '| --- | ---: | ---: | ---: |',
    ...diagnostic.failedBucketTotals.map(row => `| ${mdEscape(row.bucket)} | ${row.files} | ${row.failed} | ${row.warned} |`),
    '',
    '## File Matrix',
    '',
  ];
  for (const file of diagnostic.files) {
    lines.push(`### ${mdEscape(file.id)}`, '');
    if (file.error) {
      lines.push(`Error: ${mdEscape(file.error)}`, '');
      continue;
    }
    lines.push(`Score: ${file.score ?? 'n/a'} ${file.grade ?? ''}`.trim(), '');
    lines.push('| PAC Bucket | PAC Fail/Warn | Our Related Categories | Matching Internal Fail Rules | Matching Warn/Manual Rules | Likely Missing Family |');
    lines.push('| --- | ---: | --- | --- | --- | --- |');
    for (const gap of file.bucketGaps) {
      lines.push([
        mdEscape(gap.bucket),
        `${gap.pacFailed}/${gap.pacWarned}`,
        mdEscape(categoryCell(gap.categoryScores)),
        mdEscape(ruleCell(gap.matchingRuleFailures)),
        mdEscape(ruleCell(gap.matchingRuleWarnings)),
        mdEscape(`${gap.likelyMissingCheckerFamily} Families: ${gap.likelyFamilies.join(', ')}`),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push('');
  }
  lines.push('## Interpretation', '');
  lines.push('- This report is diagnostic-only. It does not change scoring, remediation gates, planner routing, or API responses.');
  lines.push('- A PAC bucket with no matching internal failed rule is the first priority for analyzer evidence hardening.');
  lines.push('- A PAC bucket with matching internal failures needs object-level target proof before any deterministic repair is added.');
  return `${lines.join('\n')}\n`;
}

async function listPdfFiles(dir: string): Promise<string[]> {
  const absolute = resolve(dir);
  const entries = await readdir(absolute);
  return entries
    .filter(entry => entry.toLowerCase().endsWith('.pdf'))
    .map(entry => join(absolute, entry))
    .sort((a, b) => a.localeCompare(b));
}

function idForPdf(file: string): string {
  return basename(file, extname(file)).replace(/_remediated$/, '');
}

async function pdftotext(file: string): Promise<string> {
  const { stdout } = await execFileAsync('pdftotext', [file, '-'], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function findPacReports(dir: string): Promise<Map<string, string>> {
  const files = await listPdfFiles(dir);
  const map = new Map<string, string>();
  for (const file of files) {
    const id = basename(file, extname(file)).replace(/_PAC_UA_Report$/i, '').replace(/_remediated$/i, '');
    map.set(id, file);
  }
  return map;
}

async function main(): Promise<void> {
  const pdfDir = resolve(argValue('--pdf-dir') ?? DEFAULT_PDF_DIR);
  const pacReportDir = resolve(argValue('--pac-report-dir') ?? DEFAULT_PAC_REPORT_DIR);
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const pdfs = await listPdfFiles(pdfDir);
  const reports = await findPacReports(pacReportDir);
  await mkdir(outDir, { recursive: true });
  const rows: PacReviewFileRow[] = [];

  for (const pdf of pdfs) {
    const id = idForPdf(pdf);
    const pacReport = reports.get(id) ?? null;
    try {
      const pac = pacReport ? parsePacReportText(await pdftotext(pacReport)) : null;
      const { result, snapshot } = await analyzePdf(pdf, basename(pdf), { bypassCache: true });
      const rules = buildPacRuleEvidence(snapshot);
      const categories = categorySnapshots(result.categories);
      rows.push({
        id,
        pdf,
        pacReport,
        score: scoreValue(result),
        grade: result.scoreProfile?.grade ?? result.grade ?? null,
        categories,
        pac,
        bucketGaps: pac ? buildBucketGaps(pac, rules, categories) : [],
        pacRuleFailures: rules.filter(rule => rule.status === 'fail').sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
        pacRuleWarnings: rules.filter(rule => rule.status === 'warn' || rule.confidence !== 'verified').sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
        analyzerAudits: collectAnalyzerAudits(snapshot),
      });
    } catch (error) {
      rows.push({
        id,
        pdf,
        pacReport,
        score: null,
        grade: null,
        categories: [],
        pac: null,
        bucketGaps: [],
        pacRuleFailures: [],
        pacRuleWarnings: [],
        analyzerAudits: {},
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const diagnostic = buildPacReviewDiagnostic(rows);
  await writeFile(join(outDir, 'pac-review-gap-diagnostic.json'), `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-review-gap-diagnostic.md'), renderPacReviewMarkdown(diagnostic), 'utf8');
  console.log(`Wrote PAC review gap diagnostic for ${rows.length} file(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
