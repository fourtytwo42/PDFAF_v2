import { runPythonAnalysis } from '../python/bridge.js';
import type { PythonAnalysisResult } from '../types.js';

export async function extractStructure(
  pdfPath: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<PythonAnalysisResult> {
  return runPythonAnalysis(pdfPath, options);
}
