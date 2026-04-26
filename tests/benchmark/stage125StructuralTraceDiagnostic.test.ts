import { describe, expect, it } from 'vitest';
import { classifyStage125TraceGroup, type Stage125TraceRepeat } from '../../scripts/stage125-structural-trace-diagnostic.js';

function repeat(input: Partial<Stage125TraceRepeat> & {
  root?: Record<string, unknown>;
  counters?: Record<string, number>;
  caps?: Record<string, boolean>;
  exceptions?: Array<Record<string, unknown>>;
  finalCounts?: Record<string, number>;
}): Stage125TraceRepeat {
  const trace = {
    root: input.root ?? { hasStructTreeRoot: true, rootKType: 'dict', rootChildCount: 1, initialQueueSize: 1 },
    counters: input.counters ?? { queuePops: 10, enqueuedChildren: 10 },
    caps: input.caps ?? {},
    exceptions: input.exceptions ?? [],
  };
  const finalCounts = input.finalCounts ?? { headings: 1, figures: 1, tables: 1, paragraphStructElems: 1 };
  return {
    repeat: input.repeat ?? 1,
    ok: input.ok ?? true,
    trace,
    finalCounts,
    traceSignature: input.traceSignature ?? JSON.stringify(trace),
    outputSignature: input.outputSignature ?? JSON.stringify(finalCounts),
  };
}

describe('classifyStage125TraceGroup', () => {
  it('classifies empty root /K', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({ root: { hasStructTreeRoot: true, rootKType: 'none', rootChildCount: 0, initialQueueSize: 0 } }),
      ],
    });

    expect(result.classification).toBe('root_k_unreadable_or_empty');
  });

  it('classifies enqueue drop when one repeat loses the traversal branch', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({
          repeat: 1,
          counters: { queuePops: 10, enqueuedChildren: 10 },
          finalCounts: { headings: 0, figures: 0, tables: 0, paragraphStructElems: 0 },
        }),
        repeat({
          repeat: 2,
          counters: { queuePops: 500, enqueuedChildren: 500 },
          finalCounts: { headings: 34, figures: 21, tables: 17, paragraphStructElems: 1600 },
        }),
      ],
    });

    expect(result.classification).toBe('enqueue_drop');
  });

  it('classifies early traversal exceptions', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({ exceptions: [{ phase: 'root_enqueue', error: 'bad kid' }] }),
      ],
    });

    expect(result.classification).toBe('early_traversal_exception');
  });

  it('classifies family collector exceptions', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({ exceptions: [{ phase: 'table_collector', error: 'audit failed' }] }),
      ],
    });

    expect(result.classification).toBe('family_collector_exception');
  });

  it('classifies visited-key collapse', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({
          counters: { queuePops: 50, enqueuedChildren: 50, duplicateVisitedIdCount: 5 },
          finalCounts: { headings: 0, figures: 0, tables: 0, paragraphStructElems: 0 },
        }),
        repeat({
          counters: { queuePops: 50, enqueuedChildren: 50, duplicateVisitedIdCount: 5 },
          finalCounts: { headings: 10, figures: 10, tables: 10, paragraphStructElems: 10 },
        }),
      ],
    });

    expect(result.classification).toBe('visited_key_collapse');
  });

  it('classifies stable trace with varying output counts', () => {
    const result = classifyStage125TraceGroup({
      repeats: [
        repeat({
          traceSignature: 'trace-a',
          outputSignature: 'out-a',
          finalCounts: { headings: 1, figures: 1, tables: 1, paragraphStructElems: 1 },
        }),
        repeat({
          traceSignature: 'trace-a',
          outputSignature: 'out-b',
          finalCounts: { headings: 1, figures: 1, tables: 1, paragraphStructElems: 2 },
        }),
      ],
    });

    expect(result.classification).toBe('trace_stable_but_output_varies');
  });
});
