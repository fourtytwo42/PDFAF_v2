import { describe, expect, it } from 'vitest';
import { hasUnavailableSemanticHelp } from '../../apps/pdf-af-web/components/queue/QueueDetailDrawer';
import type { SemanticSummary } from '../../apps/pdf-af-web/types/remediation';

function semanticSummary(skippedReason: SemanticSummary['skippedReason']): SemanticSummary {
  return {
    skippedReason,
    durationMs: 0,
    proposalsAccepted: skippedReason === 'completed' ? 1 : 0,
    proposalsRejected: 0,
    scoreBefore: 80,
    scoreAfter: skippedReason === 'completed' ? 82 : 80,
    batches: [],
  };
}

describe('QueueDetailDrawer AI availability notice', () => {
  it('flags semantic summaries skipped because no LLM is configured', () => {
    expect(
      hasUnavailableSemanticHelp([
        { label: 'Figures', summary: semanticSummary('no_llm_config') },
      ]),
    ).toBe(true);
  });

  it('does not flag completed semantic summaries', () => {
    expect(
      hasUnavailableSemanticHelp([
        { label: 'Figures', summary: semanticSummary('completed') },
        { label: 'Headings', summary: semanticSummary('completed_no_changes') },
      ]),
    ).toBe(false);
  });
});
