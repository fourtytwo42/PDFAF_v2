import { describe, expect, it } from 'vitest';
import { classifyStage80RawAnalyzerRow, type Stage80RawRepeat } from '../../scripts/stage80-raw-python-analyzer-diagnostic.js';

function repeat(signatures: Partial<Stage80RawRepeat['signatures']>, counts: Record<string, number> = {}): Stage80RawRepeat {
  return {
    repeat: 1,
    runtimeMs: 1,
    counts: {
      headingCount: 1,
      figureCount: 1,
      tableCount: 0,
      paragraphStructElemCount: 1,
      orphanMcidCount: 0,
      mcidTextSpanCount: 10,
      sampledPageCount: 1,
      objectRefCount: 2,
      ...counts,
    },
    signatures: {
      rawStructural: 'raw-a',
      canonicalStructural: 'canonical-a',
      structureTree: 'tree-a',
      headings: 'headings-a',
      figures: 'figures-a',
      checkerFigureTargets: 'checker-a',
      tables: 'tables-a',
      paragraphStructElems: 'paragraphs-a',
      orphanMcids: 'orphans-a',
      mcidTextSpans: 'mcids-a',
      sampledPages: 'pages-a',
      objectRefs: 'refs-a',
      ...signatures,
    },
  };
}

describe('classifyStage80RawAnalyzerRow', () => {
  it('classifies raw-order-only changes as traversal nondeterminism', () => {
    const result = classifyStage80RawAnalyzerRow({
      repeats: [
        repeat({ rawStructural: 'raw-a', canonicalStructural: 'canonical-a' }),
        repeat({ rawStructural: 'raw-b', canonicalStructural: 'canonical-a' }),
      ],
    });

    expect(result.classification).toBe('nondeterministic_traversal_order');
  });

  it('classifies changed capped MCID spans at cap as capped collection instability', () => {
    const result = classifyStage80RawAnalyzerRow({
      repeats: [
        repeat({ rawStructural: 'raw-a', canonicalStructural: 'canonical-a', mcidTextSpans: 'mcids-a' }, { mcidTextSpanCount: 500 }),
        repeat({ rawStructural: 'raw-b', canonicalStructural: 'canonical-b', mcidTextSpans: 'mcids-b' }, { mcidTextSpanCount: 500 }),
      ],
    });

    expect(result.classification).toBe('capped_collection_instability');
  });

  it('classifies object reference set changes as wrapper instability', () => {
    const result = classifyStage80RawAnalyzerRow({
      repeats: [
        repeat({ rawStructural: 'raw-a', canonicalStructural: 'canonical-a', objectRefs: 'refs-a' }, { objectRefCount: 2 }),
        repeat({ rawStructural: 'raw-b', canonicalStructural: 'canonical-b', objectRefs: 'refs-b' }, { objectRefCount: 3 }),
      ],
    });

    expect(result.classification).toBe('object_identity_wrapper_instability');
  });

  it('classifies stable raw output as downstream TypeScript-only variance', () => {
    const result = classifyStage80RawAnalyzerRow({
      repeats: [repeat({}), repeat({})],
    });

    expect(result.classification).toBe('downstream_typescript_only_variance');
  });
});
