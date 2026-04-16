/**
 * For each *.accreport.html, parse Adobe **Failed** rules, analyze the matching PDF, and assert PDFAF
 * surfaces at least one related signal per failed anchor.
 *
 * Accreports (e.g. under `Output/adobe_grade/`) are **checker output only** — the PDFs you graded are
 * usually elsewhere (e.g. `Output/corpus_ocr_pass/` or `Output/corpus_v2_engine_pass/`). Acrobat’s
 * `Filename:` may use a batch prefix (`corpus_v2__01_…pdf`) while `corpus_v2_engine_pass` stores
 * `01_…pdf` — both aliases are tried.
 *
 * Usage:
 *   pnpm exec tsx scripts/adobe-accreport-assert-pdfaf-signals.ts [reportsDir]
 * Default reportsDir: Output/adobe_grade
 *
 * Environment:
 *   ADOBE_PDFAF_PDF_DIRS — extra directories to search (comma, colon, or semicolon separated). Relative
 *     entries are resolved from the process cwd.
 *   ADOBE_PDFAF_SIGNAL_STRICT_UNMAPPED=1 — exit 1 if an Adobe failure uses an unmapped anchor handler
 *   ADOBE_PDFAF_SIGNAL_REQUIRE_PDFS=1 — exit 2 if every report is skipped (no PDF resolved)
 *   ADOBE_PDFAF_SIGNAL_STRICT=1 — require a concrete PDFAF signal for every Acrobat Failed rule (no score lenience)
 *   ADOBE_PDFAF_SIGNAL_LENIENT_MIN_SCORE=90 — when not strict, allow parity gaps if weighted score ≥ this (default 90)
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  failedAdobeAnchors,
  parseAdobeAccessibilityReportHtml,
} from '../src/services/compliance/parseAdobeAccreportHtml.js';
import { pdfafSignalCoversAdobeFailure } from '../src/services/compliance/adobeAccreportPdfafSignals.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';

function basenameFromReport(reportFileName: string, filenameFromReport: string | null): string | null {
  const fromHtml = filenameFromReport?.trim();
  if (fromHtml) return fromHtml;
  const m = reportFileName.match(/^(.+)\.accreport\.html$/i);
  return m ? m[1]! : null;
}

/**
 * OCR batch exports use `corpus_v2__` + engine-pass basename (`corpus_v2__01_….pdf` vs `01_….pdf`).
 * Prefer the stripped name first so `Output/corpus_v2_engine_pass/` matches before `corpus_ocr_pass/`.
 */
function pdfBasenameLookupAliases(basename: string): string[] {
  if (basename.startsWith('corpus_v2__')) {
    const stripped = basename.slice('corpus_v2__'.length);
    if (stripped.length > 0) return [...new Set([stripped, basename])];
  }
  return [basename];
}

function defaultPdfSearchRoots(cwd: string): string[] {
  return [
    join(cwd, 'Output', 'corpus_v2_engine_pass'),
    join(cwd, 'Output', 'corpus_ocr_pass'),
    join(cwd, 'Input', 'corpus_from_pdfaf_v1'),
  ];
}

function pdfDirsFromEnv(cwd: string): string[] {
  const raw = process.env['ADOBE_PDFAF_PDF_DIRS']?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;:]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s) ? s : join(cwd, s)));
}

function uniqueRoots(roots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of roots) {
    const n = r.replace(/[/\\]+$/, '');
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Breadth-first search for a file named `basename` under `root` (bounded). */
async function findFileNamedInSubtree(root: string, basename: string): Promise<string | null> {
  if (!existsSync(root)) return null;
  const st = await stat(root).catch(() => null);
  if (!st?.isDirectory()) return null;

  const maxDepth = 10;
  const maxDirsVisited = 4000;
  type Q = { dir: string; depth: number };
  const queue: Q[] = [{ dir: root, depth: 0 }];
  let dirsVisited = 0;

  while (queue.length && dirsVisited < maxDirsVisited) {
    const { dir, depth } = queue.shift()!;
    dirsVisited++;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isFile() && e.name === basename) return p;
    }
    if (depth >= maxDepth) continue;
    for (const e of entries) {
      if (
        !e.isDirectory() ||
        e.name.startsWith('.') ||
        e.name === 'node_modules' ||
        e.name === 'llama.cpp'
      ) {
        continue;
      }
      queue.push({ dir: join(dir, e.name), depth: depth + 1 });
    }
  }
  return null;
}

/**
 * Resolve PDF: same directory as the report, then each corpus root (flat), then recursive under roots.
 */
async function resolvePdfPath(
  reportDir: string,
  reportFileName: string,
  filenameFromReport: string | null,
  pdfRoots: string[],
): Promise<string | null> {
  const bn = basenameFromReport(reportFileName, filenameFromReport);
  if (!bn) return null;

  const aliases = pdfBasenameLookupAliases(bn);
  for (const a of aliases) {
    const directCandidates = [join(reportDir, a), ...pdfRoots.map(r => join(r, a))];
    for (const p of directCandidates) {
      if (existsSync(p)) return p;
    }
  }
  for (const a of aliases) {
    for (const r of pdfRoots) {
      const hit = await findFileNamedInSubtree(r, a);
      if (hit) return hit;
    }
  }
  return null;
}

interface RowFail {
  reportFile: string;
  pdfPath: string;
  anchor: string;
  matched: string[];
  detail: string;
  unmapped?: boolean;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const dir = process.argv[2] ?? join(cwd, 'Output', 'adobe_grade');
  const strictUnmapped = process.env['ADOBE_PDFAF_SIGNAL_STRICT_UNMAPPED'] === '1';
  const requirePdfs = process.env['ADOBE_PDFAF_SIGNAL_REQUIRE_PDFS'] === '1';
  const signalStrict = process.env['ADOBE_PDFAF_SIGNAL_STRICT'] === '1';
  const lenientFloor = signalStrict
    ? undefined
    : parseInt(process.env['ADOBE_PDFAF_SIGNAL_LENIENT_MIN_SCORE'] ?? '90', 10);

  const pdfRoots = uniqueRoots([...pdfDirsFromEnv(cwd), ...defaultPdfSearchRoots(cwd)]);

  const names = (await readdir(dir).catch(() => [])).filter(f => f.toLowerCase().endsWith('.accreport.html')).sort();
  if (names.length === 0) {
    console.error('No *.accreport.html in', dir);
    process.exit(1);
  }

  const failures: RowFail[] = [];
  const unmapped: RowFail[] = [];
  const parityGaps: RowFail[] = [];
  const skippedNoPdf: string[] = [];
  let analyzedReports = 0;

  for (const name of names) {
    const reportPath = join(dir, name);
    const html = await readFile(reportPath, 'utf8');
    const rep = parseAdobeAccessibilityReportHtml(html);
    const pdfName = rep.filename?.trim() ?? null;
    const pdfPath = await resolvePdfPath(dir, name, pdfName, pdfRoots);
    if (!pdfPath) {
      const bn = basenameFromReport(name, pdfName);
      skippedNoPdf.push(
        bn
          ? `${name} → no PDF named "${bn}" under report dir or: ${pdfRoots.join(', ')}`
          : `${name} (no Filename in report and no stem)`,
      );
      continue;
    }
    analyzedReports++;
    const baseName = pdfName ?? name.replace(/\.accreport\.html$/i, '');

    const { result, snapshot } = await analyzePdf(pdfPath, baseName);
    const anchors = failedAdobeAnchors(rep);
    for (const anchor of anchors) {
      const r = pdfafSignalCoversAdobeFailure(anchor, snapshot, result, {
        lenientWhenScoreAtLeast: lenientFloor,
      });
      if (r.parityGap) {
        parityGaps.push({
          reportFile: name,
          pdfPath,
          anchor,
          matched: r.matched,
          detail: r.detail,
        });
      }
      if (r.unmapped) {
        unmapped.push({
          reportFile: name,
          pdfPath,
          anchor,
          matched: r.matched,
          detail: r.detail,
          unmapped: true,
        });
        continue;
      }
      if (!r.ok) {
        failures.push({
          reportFile: name,
          pdfPath,
          anchor,
          matched: r.matched,
          detail: r.detail,
        });
      }
    }
  }

  if (skippedNoPdf.length) {
    console.warn('Skipped (no PDF):');
    for (const s of skippedNoPdf) console.warn(' ', s);
  }
  if (requirePdfs && analyzedReports === 0 && names.length > 0) {
    console.error(
      'ADOBE_PDFAF_SIGNAL_REQUIRE_PDFS=1 but no PDF could be resolved. Put PDFs next to reports or under:',
      pdfRoots.join(', '),
    );
    process.exit(2);
  }
  if (unmapped.length) {
    console.warn('Adobe failures with unmapped / informational handlers:');
    for (const u of unmapped) {
      console.warn(`  ${u.reportFile}  ${u.anchor}  ${u.matched.join('; ')}`);
    }
    if (strictUnmapped) {
      console.error('Strict mode: unmapped Adobe failure anchors are not allowed.');
      process.exit(1);
    }
  }

  if (parityGaps.length && !signalStrict) {
    console.warn(
      `Parity gaps (Acrobat Failed but no PDFAF signal; PDFAF score ≥ ${lenientFloor} — set ADOBE_PDFAF_SIGNAL_STRICT=1 to fail): ${parityGaps.length}`,
    );
    const by = new Map<string, number>();
    for (const g of parityGaps) by.set(g.anchor, (by.get(g.anchor) ?? 0) + 1);
    for (const [a, n] of [...by.entries()].sort((x, y) => y[1] - x[1])) {
      console.warn(`  ${a}: ${n}`);
    }
  }

  if (failures.length) {
    console.error('PDFAF did not surface a signal for these Acrobat Failed rules:\n');
    for (const f of failures) {
      console.error(`  Report: ${f.reportFile}`);
      console.error(`  PDF:    ${f.pdfPath}`);
      console.error(`  Anchor: ${f.anchor}`);
      console.error(`  Detail: ${f.detail}`);
      console.error('');
    }
    process.exit(1);
  }

  console.log(
    `OK: Adobe→PDFAF signal checks passed for ${names.length} report(s) in ${dir}` +
      (analyzedReports ? ` (${analyzedReports} PDF(s) analyzed)` : '') +
      (unmapped.length ? ` (${unmapped.length} unmapped warnings)` : '') +
      (parityGaps.length && !signalStrict ? ` (${parityGaps.length} parity-gap lenience(s))` : ''),
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
