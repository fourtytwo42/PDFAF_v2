/** Internal / debug catalog for learned playbooks (no auth in v2). */
import { Router, type IRouter } from 'express';
import { sendApiError } from '../apiError.js';
import { getDb } from '../db/client.js';
import { createPlaybookStore } from '../services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../services/learning/toolOutcomes.js';

export const playbooksRouter: IRouter = Router();

playbooksRouter.get('/', (_req, res) => {
  try {
    const db = getDb();
    const playbookStore = createPlaybookStore(db);
    const toolOutcomeStore = createToolOutcomeStore(db);

    const playbooks = playbookStore.listAll().map(p => ({
      id: p.id,
      failureSignature: p.failureSignature,
      pdfClass: p.pdfClass,
      toolCount: p.toolSequence.length,
      successCount: p.successCount,
      attemptCount: p.attemptCount,
      successRate: p.attemptCount > 0 ? p.successCount / p.attemptCount : 0,
      avgScoreImprovement: p.avgScoreImprovement,
      status: p.status,
      lastUsedAt: p.lastUsedAt,
    }));

    res.json({
      playbooks,
      toolReliability: toolOutcomeStore.getReliabilitySummary(),
    });
  } catch (e) {
    sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to load playbooks.', (e as Error).message);
  }
});
