import { Router, type IRouter } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from '../db/client.js';

export const healthRouter: IRouter = Router();

const execFileAsync = promisify(execFile);

async function checkQpdf(): Promise<'ok' | 'unavailable'> {
  try {
    await execFileAsync('qpdf', ['--version'], { timeout: 5000 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

async function checkPython(): Promise<'ok' | 'unavailable'> {
  try {
    await execFileAsync('python3', ['--version'], { timeout: 5000 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

async function checkPikepdf(): Promise<'ok' | 'unavailable'> {
  try {
    await execFileAsync('python3', ['-c', 'import pikepdf'], { timeout: 10_000 });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

function checkDb(): 'ok' | 'unavailable' {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

healthRouter.get('/', async (_req, res) => {
  const [qpdf, python, pikepdf] = await Promise.all([
    checkQpdf(),
    checkPython(),
    checkPikepdf(),
  ]);

  const db = checkDb();

  const allOk = qpdf === 'ok' && python === 'ok' && pikepdf === 'ok' && db === 'ok';

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    dependencies: { qpdf, python, pikepdf, db },
    uptime: Math.floor(process.uptime()),
  });
});
