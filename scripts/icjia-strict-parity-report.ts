#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';

type AuditRow = {
  id: string;
  file: string;
  localScore: number | null;
  localGrade: string | null;
  apiScore: number | null;
  apiGrade: string | null;
  ok: boolean;
  apiCategoryScores: Record<string, number | null>;
  localCategoryScores: Record<string, number | null>;
};

type IcjiaRaw = {
  categories?: Array<{
    id?: string;
    label?: string;
    score?: number | null;
    findings?: string[];
  }>;
};

type ParityRow = {
  id: string;
  file: string;
  localScore: number;
  localGrade: string;
  apiScore: number | null;
  apiGrade: string | null;
  localCategories: Record<string, number | null>;
  apiCategories: Record<string, number | null>;
  localSignals: {
    headingCount: number;
    h1Count: number;
    figureCount: number;
    figuresWithAlt: number;
  };
  strictFindings: {
    headingStructure: string[];
    altText: string[];
    tableMarkup: string[];
    linkQuality: string[];
  };
  questions: {
    realHeadingsPresent: boolean;
    apiStillSaysNoHeadings: boolean;
    taggedFiguresWithAltPresent: boolean;
    apiAltStillMissing: boolean;
    apiMultipleH1OrHierarchyGap: boolean;
  };
};

function parseArgs(argv: string[]): { runDir: string; ids: Set<string> | null } {
  let runDir = join(process.cwd(), 'Output', 'experiment-corpus-baseline', 'run-stage23-full-2026-04-20-r2');
  let ids: Set<string> | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (!arg.startsWith('-') && runDir.endsWith('run-stage23-full-2026-04-20-r2')) {
      runDir = arg;
      continue;
    }
    if (arg === '--filter') {
      const raw = (argv[++i] ?? '').trim();
      ids = raw ? new Set(raw.split(',').map(part => part.trim()).filter(Boolean)) : null;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { runDir: resolve(runDir), ids };
}

function findCategory(raw: IcjiaRaw, id: string): { score: number | null; findings: string[] } {
  const category = raw.categories?.find(row => row.id === id);
  return {
    score: typeof category?.score === 'number' ? category.score : null,
    findings: category?.findings ?? [],
  };
}

function hasFinding(findings: string[], pattern: RegExp): boolean {
  return findings.some(finding => pattern.test(finding));
}

function renderMarkdown(runDir: string, rows: ParityRow[]): string {
  const lines: string[] = [];
  lines.push('# ICJIA Strict Parity Report');
  lines.push('');
  lines.push(`- Run dir: \`${runDir}\``);
  lines.push(`- Rows: ${rows.length}`);
  lines.push('');
  lines.push('| ID | Local | API | H tags | Alt figures | API says no headings | API alt missing | H1/hierarchy issue |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.localScore} ${row.localGrade} | ${row.apiScore ?? '—'} ${row.apiGrade ?? ''} | ${row.localSignals.headingCount} | ${row.localSignals.figuresWithAlt}/${row.localSignals.figureCount} | ${row.questions.apiStillSaysNoHeadings ? 'yes' : 'no'} | ${row.questions.apiAltStillMissing ? 'yes' : 'no'} | ${row.questions.apiMultipleH1OrHierarchyGap ? 'yes' : 'no'} |`,
    );
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { runDir, ids } = parseArgs(process.argv.slice(2));
  const audit = JSON.parse(await readFile(join(runDir, 'icjia_audit_results.json'), 'utf8')) as { rows: AuditRow[] };
  const selected = audit.rows.filter(row => row.ok && (!ids || ids.has(row.id)));
  const rows: ParityRow[] = [];

  for (const row of selected) {
    const pdfPath = join(runDir, 'pdfs', `${row.id}.pdf`);
    const rawPath = join(runDir, 'icjia_api_raw', `${row.id}_icjia.json`);
    const [local, raw] = await Promise.all([
      analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true }),
      readFile(rawPath, 'utf8').then(text => JSON.parse(text) as IcjiaRaw),
    ]);
    const heading = findCategory(raw, 'heading_structure');
    const alt = findCategory(raw, 'alt_text');
    const table = findCategory(raw, 'table_markup');
    const link = findCategory(raw, 'link_quality');
    const figureCount = local.snapshot.figures.filter(fig => !fig.isArtifact).length;
    const figuresWithAlt = local.snapshot.figures.filter(fig => !fig.isArtifact && fig.hasAlt).length;

    rows.push({
      id: row.id,
      file: row.file,
      localScore: local.result.score,
      localGrade: local.result.grade,
      apiScore: row.apiScore,
      apiGrade: row.apiGrade,
      localCategories: {
        heading_structure: local.result.categories.find(cat => cat.key === 'heading_structure')?.score ?? null,
        alt_text: local.result.categories.find(cat => cat.key === 'alt_text')?.score ?? null,
        table_markup: local.result.categories.find(cat => cat.key === 'table_markup')?.score ?? null,
        link_quality: local.result.categories.find(cat => cat.key === 'link_quality')?.score ?? null,
      },
      apiCategories: {
        heading_structure: heading.score,
        alt_text: alt.score,
        table_markup: table.score,
        link_quality: link.score,
      },
      localSignals: {
        headingCount: local.snapshot.headings.length,
        h1Count: local.snapshot.headings.filter(item => item.level === 1).length,
        figureCount,
        figuresWithAlt,
      },
      strictFindings: {
        headingStructure: heading.findings,
        altText: alt.findings,
        tableMarkup: table.findings,
        linkQuality: link.findings,
      },
      questions: {
        realHeadingsPresent: local.snapshot.headings.length > 0,
        apiStillSaysNoHeadings: hasFinding(heading.findings, /No heading tags found/i),
        taggedFiguresWithAltPresent: figuresWithAlt > 0,
        apiAltStillMissing: hasFinding(alt.findings, /\d+\s+of\s+\d+\s+image\(s\)\s+have alternative text/i),
        apiMultipleH1OrHierarchyGap: hasFinding(heading.findings, /H1 headings instead of one|hierarchy has gaps|skipped H\d/i),
      },
    });
  }

  rows.sort((a, b) => (a.apiScore ?? 999) - (b.apiScore ?? 999) || a.id.localeCompare(b.id));
  const outDir = join(runDir, 'strict_parity');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'strict_parity_report.json'), JSON.stringify({ runDir, rows }, null, 2), 'utf8');
  await writeFile(join(outDir, 'strict_parity_report.md'), renderMarkdown(runDir, rows), 'utf8');
  console.log(`Wrote ${join(outDir, 'strict_parity_report.json')}`);
  console.log(`Wrote ${join(outDir, 'strict_parity_report.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
