import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import * as metadataTools from '../remediation/tools/metadata.js';
import type { AnalysisResult } from '../../types.js';
import type { EditFixInstruction } from '../../schemas/editFixes.js';

export interface AppliedEditFix {
  type: EditFixInstruction['type'];
  outcome: 'applied' | 'no_effect';
}

export interface RejectedEditFix {
  type: EditFixInstruction['type'];
  reason: string;
}

export interface ApplyEditFixesResult {
  before: AnalysisResult;
  after: AnalysisResult;
  buffer: Buffer;
  appliedFixes: AppliedEditFix[];
  rejectedFixes: RejectedEditFix[];
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<AnalysisResult> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-edit-fix-'));
  const path = join(dir, `${randomUUID()}-${filename || 'edited.pdf'}`);
  try {
    await writeFile(path, buffer);
    const { result } = await analyzePdf(path, filename || 'edited.pdf');
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function applyFigureMutation(
  buffer: Buffer,
  fix: Extract<EditFixInstruction, { type: 'set_figure_alt_text' | 'mark_figure_decorative' }>,
): Promise<{ buffer: Buffer; applied: boolean; reason?: string }> {
  const mutation: PythonMutation =
    fix.type === 'set_figure_alt_text'
      ? {
          op: 'set_figure_alt_text',
          params: {
            structRef: fix.objectRef,
            altText: fix.altText,
          },
        }
      : {
          op: 'mark_figure_decorative',
          params: {
            structRef: fix.objectRef,
          },
        };

  const result = await runPythonMutationBatch(buffer, [mutation]);
  if (!result.result.success) {
    return {
      buffer,
      applied: false,
      reason: result.result.failed.map((item) => item.error).join('; ') || 'mutation_failed',
    };
  }

  return {
    buffer: result.buffer,
    applied: result.result.applied.length > 0,
    reason: result.result.applied.length > 0 ? undefined : 'no_matching_target',
  };
}

export async function applyEditFixes(
  input: {
    buffer: Buffer;
    filename: string;
    fixes: EditFixInstruction[];
  },
): Promise<ApplyEditFixesResult> {
  let currentBuffer = input.buffer;
  const appliedFixes: AppliedEditFix[] = [];
  const rejectedFixes: RejectedEditFix[] = [];
  const before = await analyzeBuffer(input.buffer, input.filename);

  for (const fix of input.fixes) {
    try {
      if (fix.type === 'set_document_title') {
        const next = await metadataTools.setDocumentTitle(currentBuffer, fix.title);
        const applied = !next.equals(currentBuffer);
        currentBuffer = next;
        appliedFixes.push({ type: fix.type, outcome: applied ? 'applied' : 'no_effect' });
        continue;
      }

      if (fix.type === 'set_document_language') {
        const next = await metadataTools.setDocumentLanguage(currentBuffer, fix.language);
        const applied = !next.equals(currentBuffer);
        currentBuffer = next;
        appliedFixes.push({ type: fix.type, outcome: applied ? 'applied' : 'no_effect' });
        continue;
      }

      if (fix.type === 'set_pdfua_identification') {
        const next = await metadataTools.setPdfUaIdentification(currentBuffer, fix.language);
        const applied = !next.equals(currentBuffer);
        currentBuffer = next;
        appliedFixes.push({ type: fix.type, outcome: applied ? 'applied' : 'no_effect' });
        continue;
      }

      const next = await applyFigureMutation(currentBuffer, fix);
      if (next.applied) {
        currentBuffer = next.buffer;
        appliedFixes.push({ type: fix.type, outcome: 'applied' });
      } else {
        rejectedFixes.push({ type: fix.type, reason: next.reason ?? 'no_effect' });
      }
    } catch (error) {
      rejectedFixes.push({
        type: fix.type,
        reason: error instanceof Error ? error.message : 'fix_failed',
      });
    }
  }

  const after = await analyzeBuffer(currentBuffer, input.filename);

  return {
    before,
    after,
    buffer: currentBuffer,
    appliedFixes,
    rejectedFixes,
  };
}
