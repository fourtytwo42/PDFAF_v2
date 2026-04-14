import { spawn } from 'node:child_process';
import { PYTHON_TIMEOUT_MS, PYTHON_SCRIPT_PATH } from '../config.js';
import type { PythonAnalysisResult } from '../types.js';

// Empty result returned on timeout or script failure.
// Allows pdfjs data to still produce a partial score.
const EMPTY_RESULT: PythonAnalysisResult = {
  isTagged:      false,
  markInfo:      null,
  lang:          null,
  pdfUaVersion:  null,
  headings:      [],
  figures:       [],
  tables:        [],
  fonts:         [],
  bookmarks:     [],
  formFields:    [],
  structureTree: null,
};

export async function runPythonAnalysis(pdfPath: string): Promise<PythonAnalysisResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const done = (result: PythonAnalysisResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (!settled) {
        console.error(`[bridge] python analysis timed out after ${PYTHON_TIMEOUT_MS}ms for: ${pdfPath}`);
        proc.kill('SIGKILL');
        done(EMPTY_RESULT);
      }
    }, PYTHON_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      console.error(`[bridge] failed to spawn python3: ${err.message}`);
      done(EMPTY_RESULT);
    });

    proc.on('close', (code) => {
      if (stderr.trim()) {
        // Print warnings from the script but don't fail
        stderr.trim().split('\n').forEach(line =>
          console.warn(`[python] ${line}`)
        );
      }

      if (!stdout.trim()) {
        console.error(`[bridge] python script produced no output (exit ${code})`);
        done(EMPTY_RESULT);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as PythonAnalysisResult;
        done(parsed);
      } catch (e) {
        console.error(`[bridge] JSON parse failed: ${(e as Error).message}`);
        done(EMPTY_RESULT);
      }
    });
  });
}
