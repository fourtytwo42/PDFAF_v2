import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  PLAYBOOK_PROMOTE_MIN_SUCCESS_RATE,
  PLAYBOOK_PROMOTE_MIN_SUCCESSES,
  PLAYBOOK_RETIRE_MAX_SUCCESS_RATE,
  PLAYBOOK_RETIRE_MIN_ATTEMPTS,
} from '../../config.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  DocumentSnapshot,
  Playbook,
  PlaybookStep,
  PlaybookStatus,
} from '../../types.js';
import { buildFailureSignature } from './failureSignature.js';

export interface PlaybookStore {
  findActive(signature: string): Playbook | null;
  recordAttempt(_signature: string, _toolSequence: PlaybookStep[], _pdfClass: string): string;
  recordResult(playbookId: string, success: boolean, scoreImprovement: number): void;
  learnFromSuccess(
    analysis: AnalysisResult,
    snapshot: DocumentSnapshot,
    appliedTools: AppliedRemediationTool[],
    scoreImprovement: number,
  ): void;
  listAll(): Playbook[];
}

/**
 * Steps safe to persist: no structRef / figure ids / doc-specific blobs.
 * Figure tools are omitted when they depend on per-document structure references.
 */
const LEARNABLE_TOOL_NAMES = new Set([
  'set_document_title',
  'set_document_language',
  'set_pdfua_identification',
  'bootstrap_struct_tree',
  'repair_structure_conformance',
]);

/**
 * Build steps from planner-applied tools: `AppliedRemediationTool` has no params;
 * we only persist tool identity + stage for learnable tools (params are rebuilt at runtime via planner defaults).
 */
export function playbookStepsFromApplied(applied: AppliedRemediationTool[]): PlaybookStep[] {
  const out: PlaybookStep[] = [];
  const seen = new Set<string>();
  for (const a of applied) {
    if (a.outcome !== 'applied') continue;
    if (!LEARNABLE_TOOL_NAMES.has(a.toolName)) continue;
    const dedupe = `${a.stage}:${a.toolName}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ stage: a.stage, toolName: a.toolName, params: {} });
  }
  return out;
}

function rowToPlaybook(row: {
  id: string;
  failure_signature: string;
  pdf_class: string;
  tool_sequence: string;
  success_count: number;
  attempt_count: number;
  avg_score_improvement: number;
  status: string;
  created_at: string;
  last_used_at: string | null;
}): Playbook {
  let toolSequence: PlaybookStep[] = [];
  try {
    toolSequence = JSON.parse(row.tool_sequence) as PlaybookStep[];
  } catch {
    toolSequence = [];
  }
  return {
    id: row.id,
    failureSignature: row.failure_signature,
    pdfClass: row.pdf_class,
    toolSequence,
    successCount: row.success_count,
    attemptCount: row.attempt_count,
    avgScoreImprovement: row.avg_score_improvement,
    status: row.status as PlaybookStatus,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function recomputeStatus(successCount: number, attemptCount: number): PlaybookStatus {
  if (attemptCount >= PLAYBOOK_RETIRE_MIN_ATTEMPTS) {
    const rate = successCount / attemptCount;
    if (rate < PLAYBOOK_RETIRE_MAX_SUCCESS_RATE) return 'retired';
  }
  if (
    successCount >= PLAYBOOK_PROMOTE_MIN_SUCCESSES &&
    attemptCount > 0 &&
    successCount / attemptCount >= PLAYBOOK_PROMOTE_MIN_SUCCESS_RATE
  ) {
    return 'active';
  }
  return 'candidate';
}

export function createPlaybookStore(db: Database): PlaybookStore {
  const selectBySig = db.prepare(
    `SELECT * FROM playbooks WHERE failure_signature = ?`,
  );
  const selectById = db.prepare(`SELECT * FROM playbooks WHERE id = ?`);
  const selectAll = db.prepare(`SELECT * FROM playbooks ORDER BY created_at DESC`);
  const insert = db.prepare(`
    INSERT INTO playbooks (
      id, failure_signature, pdf_class, tool_sequence, success_count, attempt_count,
      avg_score_improvement, status, created_at, last_used_at
    ) VALUES (
      @id, @failureSignature, @pdfClass, @toolSequence, @successCount, @attemptCount,
      @avgScoreImprovement, @status, @createdAt, @lastUsedAt
    )
  `);
  const updateLearn = db.prepare(`
    UPDATE playbooks SET
      tool_sequence = @toolSequence,
      success_count = @successCount,
      attempt_count = @attemptCount,
      avg_score_improvement = @avgScoreImprovement,
      status = @status
    WHERE id = @id
  `);
  const updateResult = db.prepare(`
    UPDATE playbooks SET
      success_count = @successCount,
      attempt_count = @attemptCount,
      avg_score_improvement = @avgScoreImprovement,
      status = @status,
      last_used_at = @lastUsedAt
    WHERE id = @id
  `);

  return {
    findActive(signature: string): Playbook | null {
      const raw = selectBySig.get(signature) as {
        id: string;
        failure_signature: string;
        pdf_class: string;
        tool_sequence: string;
        success_count: number;
        attempt_count: number;
        avg_score_improvement: number;
        status: string;
        created_at: string;
        last_used_at: string | null;
      } | undefined;
      if (!raw || raw.status !== 'active') return null;
      return rowToPlaybook(raw);
    },

    recordAttempt(): string {
      return randomUUID();
    },

    recordResult(playbookId: string, success: boolean, scoreImprovement: number): void {
      const raw = selectById.get(playbookId) as
        | {
            id: string;
            failure_signature: string;
            pdf_class: string;
            tool_sequence: string;
            success_count: number;
            attempt_count: number;
            avg_score_improvement: number;
            status: string;
            created_at: string;
            last_used_at: string | null;
          }
        | undefined;
      if (!raw) return;

      let successCount = raw.success_count;
      let attemptCount = raw.attempt_count + 1;
      if (success) successCount += 1;

      const rate = successCount / attemptCount;
      let avg = raw.avg_score_improvement;
      if (success && scoreImprovement > 0) {
        const prevN = raw.success_count;
        avg = (raw.avg_score_improvement * prevN + scoreImprovement) / Math.max(successCount, 1);
      }

      const status = recomputeStatus(successCount, attemptCount);
      updateResult.run({
        id: playbookId,
        successCount,
        attemptCount,
        avgScoreImprovement: avg,
        status,
        lastUsedAt: new Date().toISOString(),
      });
    },

    learnFromSuccess(
      analysis: AnalysisResult,
      snapshot: DocumentSnapshot,
      appliedTools: AppliedRemediationTool[],
      scoreImprovement: number,
    ): void {
      const failureSignature = buildFailureSignature(analysis, snapshot);
      const steps = playbookStepsFromApplied(appliedTools);
      if (steps.length === 0) return;

      const rawExisting = selectBySig.get(failureSignature) as
        | {
            id: string;
            failure_signature: string;
            pdf_class: string;
            tool_sequence: string;
            success_count: number;
            attempt_count: number;
            avg_score_improvement: number;
            status: string;
            created_at: string;
            last_used_at: string | null;
          }
        | undefined;

      const now = new Date().toISOString();
      const toolSequence = JSON.stringify(steps);

      if (!rawExisting) {
        const successCount = 1;
        const attemptCount = 1;
        const status = recomputeStatus(successCount, attemptCount);
        insert.run({
          id: randomUUID(),
          failureSignature,
          pdfClass: analysis.pdfClass,
          toolSequence,
          successCount,
          attemptCount,
          avgScoreImprovement: scoreImprovement,
          status,
          createdAt: now,
          lastUsedAt: null,
        });
        return;
      }

      const successCount = rawExisting.success_count + 1;
      const attemptCount = rawExisting.attempt_count + 1;
      const avgScoreImprovement =
        (rawExisting.avg_score_improvement * rawExisting.success_count + scoreImprovement) / successCount;
      const status = recomputeStatus(successCount, attemptCount);

      updateLearn.run({
        id: rawExisting.id,
        toolSequence,
        successCount,
        attemptCount,
        avgScoreImprovement,
        status,
      });
    },

    listAll(): Playbook[] {
      const rows = selectAll.all() as Array<Parameters<typeof rowToPlaybook>[0]>;
      return rows.map(rowToPlaybook);
    },
  };
}
