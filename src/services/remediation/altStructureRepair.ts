import { createHash, randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PYTHON_MUTATION_TIMEOUT_MS } from '../../config.js';
import { runPythonMutationBatch } from '../../python/bridge.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';

/**
 * Post-remediation cleanup pass for tagged PDFs:
 *  1. repair_alt_text_structure — fix nested alt / alt-not-associated / fill missing figure alt
 *  2. repair_annotation_alt_text — ensure annotation structure elements have Contents (OtherAltText)
 *  3. mark_untagged_content_as_artifact — tag residual untagged content (TaggedCont)
 *  4. repair_alt_text_structure (again) — artifact pass can leave /Alt on non-Figure wrappers (Acrobat Other elements)
 *
 * Runs for real structure trees and for /MarkInfo-only shells / strong TaggedCont heuristics
 * so Adobe checks pass even when our internal score is >= 95.
 */
export async function applyPostRemediationAltRepair(
  buffer: Buffer,
  filename: string,
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  opts?: { signal?: AbortSignal },
): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot }> {
  if (analysis.pdfClass === 'scanned') {
    return { buffer, analysis, snapshot };
  }
  const paint = snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0;
  const hasTree = snapshot.isTagged || snapshot.structureTree !== null;
  const markedShell = snapshot.markInfo?.Marked === true && !hasTree;
  if (!hasTree && !markedShell && paint === 0) {
    return { buffer, analysis, snapshot };
  }
  const beforeH = createHash('sha256').update(buffer).digest('hex');
  const { buffer: nextBuf, result } = await runPythonMutationBatch(
    buffer,
    [
      { op: 'repair_alt_text_structure', params: {} },
      { op: 'repair_annotation_alt_text', params: {} },
      { op: 'mark_untagged_content_as_artifact', params: {} },
      { op: 'repair_alt_text_structure', params: {} },
    ],
    { signal: opts?.signal, timeoutMs: PYTHON_MUTATION_TIMEOUT_MS },
  );
  if (!result.success) {
    return { buffer, analysis, snapshot };
  }
  const afterH = createHash('sha256').update(nextBuf).digest('hex');
  if (beforeH === afterH) {
    return { buffer, analysis, snapshot };
  }
  const tmp = join(tmpdir(), `pdfaf-altfix-${randomUUID()}.pdf`);
  await writeFile(tmp, nextBuf);
  try {
    const out = await analyzePdf(tmp, filename);
    return { buffer: nextBuf, analysis: out.result, snapshot: out.snapshot };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
