import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type IRouter } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DB_PATH,
  getOpenAiCompatApiKey,
  getOpenAiCompatBaseUrl,
  HEALTH_LLM_PROBE_TIMEOUT_MS,
  PYTHON_BIN,
  QPDF_BIN,
} from '../config.js';
import { getDb } from '../db/client.js';
import { remediationStatsLast24h } from '../metrics.js';

export const healthRouter: IRouter = Router();

const execFileAsync = promisify(execFile);

function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const p = JSON.parse(raw) as { version?: string };
    return p.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function execVersion(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000 });
    const line = stdout.trim().split('\n')[0]?.trim();
    return line ?? null;
  } catch {
    return null;
  }
}

async function checkQpdf(): Promise<{ status: 'ok' | 'unavailable'; version: string | null; bin: string }> {
  const line = await execVersion(QPDF_BIN, ['--version']);
  return line
    ? { status: 'ok', version: line, bin: QPDF_BIN }
    : { status: 'unavailable', version: null, bin: QPDF_BIN };
}

async function checkPython(): Promise<{ status: 'ok' | 'unavailable'; version: string | null }> {
  const line = await execVersion(PYTHON_BIN, ['--version']);
  return line ? { status: 'ok', version: line } : { status: 'unavailable', version: null };
}

async function checkPikepdf(): Promise<'ok' | 'unavailable'> {
  try {
    await execFileAsync(PYTHON_BIN, ['-c', 'import pikepdf'], { timeout: 10_000 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

async function checkFonttools(): Promise<'ok' | 'unavailable'> {
  try {
    await execFileAsync(PYTHON_BIN, ['-c', 'import fontTools'], { timeout: 10_000 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

async function checkTesseract(): Promise<{ available: boolean; version: string | null }> {
  const line = await execVersion('tesseract', ['--version']);
  return { available: Boolean(line), version: line };
}

async function checkOcrmypdf(): Promise<{ available: boolean; version: string | null }> {
  const line = await execVersion('ocrmypdf', ['--version']);
  return { available: Boolean(line), version: line };
}

function checkDb(): { ok: boolean; error?: string } {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function probeLlmReachable(): Promise<boolean> {
  const base = getOpenAiCompatBaseUrl().trim();
  if (!base) return false;
  const url = `${base.replace(/\/$/, '')}/models`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), HEALTH_LLM_PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    const key = getOpenAiCompatApiKey().trim();
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    const r = await fetch(url, { method: 'GET', headers, signal: ac.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

healthRouter.get('/', async (_req, res) => {
  const [qpdfR, pythonR, pikepdf, fonttools, tesseract, ocrmypdf] = await Promise.all([
    checkQpdf(),
    checkPython(),
    checkPikepdf(),
    checkFonttools(),
    checkTesseract(),
    checkOcrmypdf(),
  ]);

  const dbCheck = checkDb();
  let playbookByStatus: Record<string, number> = {};
  let toolOutcomeCount = 0;
  let analyses24h = 0;
  let avgAnalysisMs: number | null = null;

  if (dbCheck.ok) {
    try {
      const db = getDb();
      const pbRows = db.prepare(`SELECT status, COUNT(*) as c FROM playbooks GROUP BY status`).all() as Array<{
        status: string;
        c: number;
      }>;
      playbookByStatus = Object.fromEntries(pbRows.map(r => [r.status, r.c]));

      const toRow = db.prepare(`SELECT COUNT(*) as c FROM tool_outcomes`).get() as { c: number };
      toolOutcomeCount = toRow.c;

      const q24 = db
        .prepare(
          `SELECT COUNT(*) as c, AVG(duration_ms) as avg_ms FROM queue_items
           WHERE datetime(created_at) >= datetime('now', '-1 day')`,
        )
        .get() as { c: number; avg_ms: number | null };
      analyses24h = q24.c;
      avgAnalysisMs = q24.avg_ms != null ? Math.round(q24.avg_ms) : null;
    } catch {
      /* ignore secondary DB errors */
    }
  }

  const llmConfigured = Boolean(getOpenAiCompatBaseUrl().trim());
  let llmReachable = false;
  if (llmConfigured) {
    llmReachable = await probeLlmReachable();
  }

  const coreOk =
    qpdfR.status === 'ok' &&
    pythonR.status === 'ok' &&
    pikepdf === 'ok' &&
    fonttools === 'ok' &&
    dbCheck.ok;

  const degradedReasons: string[] = [];
  if (!coreOk) {
    if (qpdfR.status !== 'ok') degradedReasons.push('qpdf');
    if (pythonR.status !== 'ok') degradedReasons.push('python');
    if (pikepdf !== 'ok') degradedReasons.push('pikepdf');
    if (fonttools !== 'ok') degradedReasons.push('fonttools');
    if (!dbCheck.ok) degradedReasons.push('database');
  }
  if (llmConfigured && !llmReachable) {
    degradedReasons.push('llm_unreachable');
  }

  let status: 'ok' | 'degraded' | 'down' = 'ok';
  if (!dbCheck.ok) {
    status = 'down';
  } else if (!coreOk || degradedReasons.length > 0) {
    status = 'degraded';
  }

  const remedStats = remediationStatsLast24h();
  const playbooksActive = playbookByStatus['active'] ?? 0;
  const playbooksCandidate = playbookByStatus['candidate'] ?? 0;
  const playbooksRetired = playbookByStatus['retired'] ?? 0;

  const httpStatus = status === 'down' ? 503 : 200;

  res.status(httpStatus).json({
    status,
    version: readAppVersion(),
    uptime: Math.floor(process.uptime()),
    port: parseInt(process.env['PORT'] ?? '6200', 10),
    dependencies: {
      qpdf: {
        available: qpdfR.status === 'ok',
        version: qpdfR.version,
        bin: qpdfR.bin,
        required: true,
      },
      python: {
        available: pythonR.status === 'ok',
        version: pythonR.version,
        bin: PYTHON_BIN,
        pikepdf: pikepdf === 'ok',
        fonttools: fonttools === 'ok',
        required: true,
      },
      tesseract: { available: tesseract.available, version: tesseract.version, required: false },
      ocrmypdf: { available: ocrmypdf.available, version: ocrmypdf.version, required: false },
      llm: {
        configured: llmConfigured,
        reachable: llmConfigured ? llmReachable : false,
        required: false,
      },
      database: {
        ok: dbCheck.ok,
        path: DB_PATH,
        playbooks: playbookByStatus,
        toolOutcomes: toolOutcomeCount,
        ...(dbCheck.error ? { error: dbCheck.error } : {}),
      },
    },
    performance: {
      analysesLast24h: analyses24h,
      avgAnalysisMs: avgAnalysisMs ?? 0,
      remediationsLast24h: remedStats.count,
      avgRemediationMs: remedStats.avgMs,
      playbooks: {
        active: playbooksActive,
        candidate: playbooksCandidate,
        retired: playbooksRetired,
      },
    },
    ...(degradedReasons.length > 0 ? { degradedReasons } : {}),
  });
});
