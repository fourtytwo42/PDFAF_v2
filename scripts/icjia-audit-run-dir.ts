/**
 * Audit benchmark run PDFs against the ICJIA API and compare remote scores to local PDFAF scores.
 *
 * Usage:
 *   pnpm exec tsx scripts/icjia-audit-run-dir.ts [runDir]
 *
 * Defaults:
 *   Output/experiment-corpus-baseline/run-stage20-full
 *
 * Inputs:
 *   - <runDir>/manifest.snapshot.json
 *   - <runDir>/remediate.results.json
 *   - <runDir>/pdfs/<id>.pdf
 *
 * Outputs:
 *   - <runDir>/icjia_api_raw/<id>_icjia.json
 *   - <runDir>/icjia_audit_results.json
 *   - <runDir>/icjia_audit_report.md
 */
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { IcjiaAnalyzeJson } from './icjia-api-client.js';
import { DEFAULT_ICJIA_URL, postIcjiaAnalyze, sleep } from './icjia-api-client.js';

type LocalCategory = {
  key?: string;
  score?: number | null;
  applicable?: boolean;
};

type RemediateRow = {
  id: string;
  file: string;
  cohort: string;
  sourceType: string;
  intent: string;
  notes?: string;
  afterScore: number | null;
  afterGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  afterCategories?: LocalCategory[];
  reanalyzedCategories?: LocalCategory[];
  error?: string;
};

type ManifestSnapshot = {
  runId: string;
  generatedAt: string;
  manifestPath: string;
  corpusRoot: string;
  mode: string;
  semanticEnabled: boolean;
  writePdfs: boolean;
  selectedEntries: Array<{
    id: string;
    file: string;
    cohort: string;
    sourceType: string;
    intent: string;
    notes?: string;
  }>;
};

type AuditRow = {
  id: string;
  file: string;
  cohort: string;
  sourceType: string;
  localScore: number | null;
  localGrade: string | null;
  apiScore: number | null;
  apiGrade: string | null;
  delta: number | null;
  httpStatus: number;
  ok: boolean;
  errorText?: string;
  localCategoryScores: Record<string, number | null>;
  apiCategoryScores: Record<string, number | null>;
  topApiIssues: string[];
};

type AggregateCategory = {
  id: string;
  files: number;
  apiScoreCount: number;
  apiScoreSum: number;
  localScoreCount: number;
  localScoreSum: number;
  deltaCount: number;
  deltaSum: number;
  apiBelow90Count: number;
  apiBelow80Count: number;
};

const SAFE_RATE_LIMIT_INTERVAL_MS = 110_000;

type ParsedArgs = {
  runDir: string;
  limit: number;
  offset: number;
  force: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  let runDir = join(process.cwd(), 'Output', 'experiment-corpus-baseline', 'run-stage20-full');
  let limit = 0;
  let offset = 0;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (!arg.startsWith('-') && runDir.endsWith('run-stage20-full')) {
      runDir = arg;
      continue;
    }
    switch (arg) {
      case '--limit': {
        const value = parseInt(argv[++i] ?? '', 10);
        if (!Number.isFinite(value) || value < 0) throw new Error('Invalid --limit value.');
        limit = value;
        break;
      }
      case '--offset': {
        const value = parseInt(argv[++i] ?? '', 10);
        if (!Number.isFinite(value) || value < 0) throw new Error('Invalid --offset value.');
        offset = value;
        break;
      }
      case '--force':
        force = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { runDir: resolve(runDir), limit, offset, force };
}

function parseMinIntervalMs(): number {
  const raw = (process.env['PDFAF_ICJIA_MIN_INTERVAL_MS'] ?? '').trim();
  if (!raw) return SAFE_RATE_LIMIT_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1_000 ? n : SAFE_RATE_LIMIT_INTERVAL_MS;
}

function localScoreFor(row: RemediateRow): { score: number | null; grade: string | null; categories: LocalCategory[] } {
  if (typeof row.reanalyzedScore === 'number') {
    return {
      score: row.reanalyzedScore,
      grade: row.reanalyzedGrade ?? row.afterGrade ?? null,
      categories: row.reanalyzedCategories ?? [],
    };
  }
  return {
    score: row.afterScore ?? null,
    grade: row.afterGrade ?? null,
    categories: row.afterCategories ?? [],
  };
}

function scoreMap(categories: LocalCategory[] | IcjiaAnalyzeJson['categories'] | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const category of categories ?? []) {
    const id = 'key' in category ? category.key : category.id;
    if (!id) continue;
    out[id] = typeof category.score === 'number' ? category.score : null;
  }
  return out;
}

function topApiIssues(categories: IcjiaAnalyzeJson['categories'] | undefined): string[] {
  return (categories ?? [])
    .filter(category => typeof category.score === 'number' && category.score < 100)
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
    .slice(0, 3)
    .map(category => {
      const label = category.label ?? category.id ?? 'unknown';
      const finding = category.findings?.[0]?.replace(/\s+/g, ' ').trim() ?? 'No finding text';
      return `${label}: ${finding}`;
    });
}

function mean(sum: number, count: number): string {
  return count > 0 ? (sum / count).toFixed(1) : '—';
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function renderMarkdown(args: {
  runDir: string;
  manifest: ManifestSnapshot;
  rows: AuditRow[];
  minIntervalMs: number;
  icjiaUrl: string;
}): string {
  const okRows = args.rows.filter(row => row.ok && typeof row.apiScore === 'number');
  const sortedByApi = [...okRows].sort((a, b) => (a.apiScore ?? 101) - (b.apiScore ?? 101));
  const worstRows = sortedByApi.slice(0, 15);
  const deltaRows = [...okRows]
    .filter(row => typeof row.delta === 'number')
    .sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999))
    .slice(0, 15);

  const categories = new Map<string, AggregateCategory>();
  for (const row of okRows) {
    const ids = new Set([...Object.keys(row.localCategoryScores), ...Object.keys(row.apiCategoryScores)]);
    for (const id of ids) {
      const agg = categories.get(id) ?? {
        id,
        files: 0,
        apiScoreCount: 0,
        apiScoreSum: 0,
        localScoreCount: 0,
        localScoreSum: 0,
        deltaCount: 0,
        deltaSum: 0,
        apiBelow90Count: 0,
        apiBelow80Count: 0,
      };
      agg.files += 1;
      const local = row.localCategoryScores[id];
      const api = row.apiCategoryScores[id];
      if (typeof local === 'number') {
        agg.localScoreCount += 1;
        agg.localScoreSum += local;
      }
      if (typeof api === 'number') {
        agg.apiScoreCount += 1;
        agg.apiScoreSum += api;
        if (api < 90) agg.apiBelow90Count += 1;
        if (api < 80) agg.apiBelow80Count += 1;
      }
      if (typeof local === 'number' && typeof api === 'number') {
        agg.deltaCount += 1;
        agg.deltaSum += local - api;
      }
      categories.set(id, agg);
    }
  }

  const categoryRows = [...categories.values()].sort((a, b) => {
    const aApi = a.apiScoreCount > 0 ? a.apiScoreSum / a.apiScoreCount : 999;
    const bApi = b.apiScoreCount > 0 ? b.apiScoreSum / b.apiScoreCount : 999;
    if (aApi !== bApi) return aApi - bApi;
    return b.deltaSum - a.deltaSum;
  });

  const lines: string[] = [];
  lines.push('# ICJIA Audit Report');
  lines.push('');
  lines.push(`- **Run dir:** \`${args.runDir}\``);
  lines.push(`- **Run id:** \`${args.manifest.runId}\``);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push(`- **Corpus manifest:** \`${args.manifest.manifestPath}\``);
  lines.push(`- **Files selected:** ${args.manifest.selectedEntries.length}`);
  lines.push(`- **Semantic enabled:** ${args.manifest.semanticEnabled ? 'yes' : 'no'}`);
  lines.push(`- **Write PDFs:** ${args.manifest.writePdfs ? 'yes' : 'no'}`);
  lines.push(`- **ICJIA URL:** ${args.icjiaUrl}`);
  lines.push(`- **Min API interval:** ${args.minIntervalMs} ms`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **API successes:** ${okRows.length} / ${args.rows.length}`);
  lines.push(`- **API A grades:** ${okRows.filter(row => row.apiGrade === 'A').length} / ${okRows.length}`);
  lines.push(`- **API score min / avg / max:** ${
    okRows.length > 0 ? Math.min(...okRows.map(row => row.apiScore ?? 0)) : '—'
  } / ${
    okRows.length > 0
      ? (okRows.reduce((sum, row) => sum + (row.apiScore ?? 0), 0) / okRows.length).toFixed(1)
      : '—'
  } / ${okRows.length > 0 ? Math.max(...okRows.map(row => row.apiScore ?? 0)) : '—'}`);
  lines.push(`- **Local score min / avg / max:** ${
    okRows.length > 0 ? Math.min(...okRows.map(row => row.localScore ?? 0)) : '—'
  } / ${
    okRows.length > 0
      ? (okRows.reduce((sum, row) => sum + (row.localScore ?? 0), 0) / okRows.length).toFixed(1)
      : '—'
  } / ${okRows.length > 0 ? Math.max(...okRows.map(row => row.localScore ?? 0)) : '—'}`);
  lines.push(`- **Mean local minus API delta:** ${
    okRows.length > 0
      ? (
          okRows
            .filter(row => typeof row.delta === 'number')
            .reduce((sum, row) => sum + (row.delta ?? 0), 0) /
          Math.max(1, okRows.filter(row => typeof row.delta === 'number').length)
        ).toFixed(1)
      : '—'
  }`);
  lines.push('');
  lines.push('## Category Gaps');
  lines.push('');
  lines.push('| Category | API avg | Local avg | Mean delta | API < 90 | API < 80 | |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of categoryRows) {
    lines.push(
      `| ${row.id} | ${mean(row.apiScoreSum, row.apiScoreCount)} | ${mean(row.localScoreSum, row.localScoreCount)} | ${mean(row.deltaSum, row.deltaCount)} | ${row.apiBelow90Count} | ${row.apiBelow80Count} | |`,
    );
  }
  lines.push('');
  lines.push('## Worst API Scores');
  lines.push('');
  lines.push('| ID | File | Local | API | Delta | Top API issues |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const row of worstRows) {
    lines.push(
      `| ${row.id} | ${escapePipe(row.file)} | ${row.localScore ?? '—'} | ${row.apiScore ?? '—'} | ${row.delta ?? '—'} | ${escapePipe(row.topApiIssues.join(' ; '))} |`,
    );
  }
  lines.push('');
  lines.push('## Largest Local Vs API Deltas');
  lines.push('');
  lines.push('| ID | File | Local | API | Delta |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  for (const row of deltaRows) {
    lines.push(`| ${row.id} | ${escapePipe(row.file)} | ${row.localScore ?? '—'} | ${row.apiScore ?? '—'} | ${row.delta ?? '—'} |`);
  }
  lines.push('');
  lines.push('## Failures');
  lines.push('');
  const failedRows = args.rows.filter(row => !row.ok);
  if (failedRows.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| ID | File | HTTP | Error |');
    lines.push('| --- | --- | ---: | --- |');
    for (const row of failedRows) {
      lines.push(
        `| ${row.id} | ${escapePipe(row.file)} | ${row.httpStatus} | ${escapePipe((row.errorText ?? '').slice(0, 200))} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runDir = args.runDir;
  const icjiaUrl = (process.env['PDFAF_ICJIA_ANALYZE_URL'] ?? DEFAULT_ICJIA_URL).trim() || DEFAULT_ICJIA_URL;
  const minIntervalMs = parseMinIntervalMs();
  const rawDir = join(runDir, 'icjia_api_raw');

  const manifest = JSON.parse(await readFile(join(runDir, 'manifest.snapshot.json'), 'utf8')) as ManifestSnapshot;
  const remediateRows = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as RemediateRow[];

  if (!manifest.writePdfs) {
    throw new Error(`Run ${runDir} does not contain written PDFs. Re-run benchmark with --write-pdfs first.`);
  }

  await mkdir(rawDir, { recursive: true });

  const auditRows: AuditRow[] = [];
  let lastAuditAt = 0;
  const selectedRows = (args.limit > 0 ? remediateRows.slice(args.offset, args.offset + args.limit) : remediateRows.slice(args.offset));

  for (const row of selectedRows) {
    const pdfPath = join(runDir, 'pdfs', `${row.id}.pdf`);
    const local = localScoreFor(row);
    const localCategoryScores = scoreMap(local.categories);
    if (row.error) {
      auditRows.push({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        sourceType: row.sourceType,
        localScore: local.score,
        localGrade: local.grade,
        apiScore: null,
        apiGrade: null,
        delta: null,
        httpStatus: 0,
        ok: false,
        errorText: row.error,
        localCategoryScores,
        apiCategoryScores: {},
        topApiIssues: [],
      });
      continue;
    }

    const outJsonPath = join(rawDir, `${row.id}_icjia.json`);
    if (!args.force && (await exists(outJsonPath))) {
      const cached = JSON.parse(await readFile(outJsonPath, 'utf8')) as IcjiaAnalyzeJson;
      const apiCategoryScores = scoreMap(cached.categories);
      const apiScore = typeof cached.overallScore === 'number' ? cached.overallScore : null;
      auditRows.push({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        sourceType: row.sourceType,
        localScore: local.score,
        localGrade: local.grade,
        apiScore,
        apiGrade: cached.grade ?? null,
        delta: typeof local.score === 'number' && typeof apiScore === 'number' ? local.score - apiScore : null,
        httpStatus: 200,
        ok: true,
        localCategoryScores,
        apiCategoryScores,
        topApiIssues: topApiIssues(cached.categories),
      });
      console.log(`[${row.id}] reused cached ICJIA result`);
      continue;
    }

    const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastAuditAt));
    if (waitMs > 0 && lastAuditAt > 0) {
      console.log(`[${row.id}] waiting ${Math.round(waitMs / 1000)}s before next ICJIA request`);
      await sleep(waitMs);
    }

    const pdfBuffer = await readFile(pdfPath);
    lastAuditAt = Date.now();
    console.log(`[${row.id}] auditing ${basename(pdfPath)} via ${icjiaUrl}`);
    const result = await postIcjiaAnalyze(icjiaUrl, pdfBuffer, `${row.id}.pdf`);
    const apiCategoryScores = scoreMap(result.json?.categories);
    if (result.rawBody) {
      try {
        const pretty = JSON.stringify(JSON.parse(result.rawBody), null, 2);
        await writeFile(outJsonPath, pretty, 'utf8');
      } catch {
        await writeFile(outJsonPath, result.rawBody, 'utf8');
      }
    }

    const apiScore = typeof result.json?.overallScore === 'number' ? result.json.overallScore : null;
    auditRows.push({
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      sourceType: row.sourceType,
      localScore: local.score,
      localGrade: local.grade,
      apiScore,
      apiGrade: result.json?.grade ?? null,
      delta: typeof local.score === 'number' && typeof apiScore === 'number' ? local.score - apiScore : null,
      httpStatus: result.status,
      ok: result.ok,
      errorText: result.errorText,
      localCategoryScores,
      apiCategoryScores,
      topApiIssues: topApiIssues(result.json?.categories),
    });
  }

  const auditJson = {
    runDir,
    generatedAt: new Date().toISOString(),
    icjiaUrl,
    minIntervalMs,
    offset: args.offset,
    limit: args.limit,
    force: args.force,
    rows: auditRows,
  };
  const report = renderMarkdown({ runDir, manifest, rows: auditRows, minIntervalMs, icjiaUrl });

  await writeFile(join(runDir, 'icjia_audit_results.json'), JSON.stringify(auditJson, null, 2), 'utf8');
  await writeFile(join(runDir, 'icjia_audit_report.md'), report, 'utf8');

  console.log(`Wrote ${join(runDir, 'icjia_audit_results.json')}`);
  console.log(`Wrote ${join(runDir, 'icjia_audit_report.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
