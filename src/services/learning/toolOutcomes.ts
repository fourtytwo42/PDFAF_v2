import type { Database } from 'better-sqlite3';
import {
  TOOL_OUTCOME_MIN_ATTEMPTS_FOR_ACTUAL,
  TOOL_OUTCOME_OPTIMISTIC_SUCCESS_RATE,
  TOOL_OUTCOME_ROLLING_WINDOW,
} from '../../config.js';
import type { PdfClass, ToolReliability } from '../../types.js';

export type ToolOutcomeKind = 'applied' | 'no_effect' | 'rejected' | 'failed';

export interface ToolOutcomeInput {
  toolName: string;
  pdfClass: PdfClass;
  outcome: ToolOutcomeKind;
  scoreBefore: number;
  scoreAfter: number;
}

export interface ToolOutcomeStore {
  record(outcome: ToolOutcomeInput): void;
  getReliability(toolName: string, pdfClass: PdfClass): ToolReliability;
  getReliabilitySummary(): ToolReliability[];
}

export function createToolOutcomeStore(db: Database): ToolOutcomeStore {
  const insert = db.prepare(`
    INSERT INTO tool_outcomes (tool_name, pdf_class, outcome, score_before, score_after, created_at)
    VALUES (@toolName, @pdfClass, @outcome, @scoreBefore, @scoreAfter, @createdAt)
  `);

  const selectRecent = db.prepare(`
    SELECT outcome, score_before, score_after
    FROM tool_outcomes
    WHERE tool_name = ? AND pdf_class = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  const computeReliability = (toolName: string, pdfClass: PdfClass): ToolReliability => {
    const rows = selectRecent.all(toolName, pdfClass, TOOL_OUTCOME_ROLLING_WINDOW) as Array<{
      outcome: string;
      score_before: number;
      score_after: number;
    }>;

    const attempts = rows.length;
    if (attempts < TOOL_OUTCOME_MIN_ATTEMPTS_FOR_ACTUAL) {
      return {
        toolName,
        pdfClass,
        attempts: 0,
        successRate: TOOL_OUTCOME_OPTIMISTIC_SUCCESS_RATE,
        avgScoreDelta: 0,
      };
    }

    let applied = 0;
    let deltaSum = 0;
    for (const r of rows) {
      if (r.outcome === 'applied') {
        applied++;
        deltaSum += r.score_after - r.score_before;
      }
    }
    const successRate = applied / attempts;
    const avgScoreDelta = applied > 0 ? deltaSum / applied : 0;
    return { toolName, pdfClass, attempts, successRate, avgScoreDelta };
  };

  const selectDistinctPairs = db.prepare(`
    SELECT DISTINCT tool_name, pdf_class FROM tool_outcomes
  `);

  return {
    record(o: ToolOutcomeInput): void {
      insert.run({
        toolName: o.toolName,
        pdfClass: o.pdfClass,
        outcome: o.outcome,
        scoreBefore: o.scoreBefore,
        scoreAfter: o.scoreAfter,
        createdAt: new Date().toISOString(),
      });
    },

    getReliability(toolName: string, pdfClass: PdfClass): ToolReliability {
      return computeReliability(toolName, pdfClass);
    },

    getReliabilitySummary(): ToolReliability[] {
      const pairs = selectDistinctPairs.all() as Array<{ tool_name: string; pdf_class: PdfClass }>;
      return pairs.map(p => computeReliability(p.tool_name, p.pdf_class));
    },
  };
}
