import {
  STAGE3_HEADER_FOOTER_REPEAT_THRESHOLD,
  STAGE3_MULTI_COLUMN_X_GAP,
  STAGE3_PARAGRAPH_DENSITY_THRESHOLD,
  STAGE3_SUSPICIOUS_PAGE_SAMPLE_CAP,
  STAGE3_TABLE_STRONG_IRREGULAR_ROWS_THRESHOLD,
} from '../../config.js';
import type { DetectionProfile, DocumentSnapshot } from '../../types.js';

function normalizeStructType(type: string | undefined): string {
  return (type ?? '').replace(/^\//, '').trim();
}

function walkTree(
  node: DocumentSnapshot['structureTree'],
  depth = 0,
): Array<{ type: string; depth: number }> {
  if (!node) return [];
  const out = [{ type: normalizeStructType(node.type), depth }];
  for (const child of node.children ?? []) {
    out.push(...walkTree(child, depth + 1));
  }
  return out;
}

function headingSignals(snapshot: DocumentSnapshot) {
  const nodes = walkTree(snapshot.structureTree);
  const headingNodes = nodes.filter(node => /^H([1-6])?$/.test(node.type));
  const rootReachableHeadingCount = snapshot.structureDebug?.rootReachableHeadingCount ?? 0;
  const rootReachableDepth = snapshot.structureDebug?.rootReachableDepth ?? 0;
  const treeHeadingCount = Math.max(headingNodes.length, rootReachableHeadingCount);
  const headingTreeDepth = Math.max(
    headingNodes.length > 0 ? Math.max(...headingNodes.map(node => node.depth)) : 0,
    rootReachableHeadingCount > 0 ? rootReachableDepth : 0,
  );
  return {
    extractedHeadingCount: snapshot.headings.length,
    treeHeadingCount,
    headingTreeDepth,
    rootReachableHeadingCount,
    rootReachableDepth,
    extractedHeadingsMissingFromTree: snapshot.headings.length > 0 && treeHeadingCount === 0,
  };
}

function rectsOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function expandBbox(bbox: [number, number, number, number], pad = 64): [number, number, number, number] {
  return [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
}

function figureCaptionPairCount(snapshot: DocumentSnapshot): number {
  const captions = snapshot.layoutAudit?.captionCandidates ?? [];
  if (captions.length === 0 || snapshot.figures.length === 0) return 0;
  const usedCaptions = new Set<number>();
  let pairs = 0;
  for (const figure of snapshot.figures) {
    if (!figure.bbox) continue;
    const expanded = expandBbox(figure.bbox);
    const matchIndex = captions.findIndex((caption, index) =>
      !usedCaptions.has(index) &&
      caption.page === figure.page &&
      rectsOverlap(expanded, caption.bbox),
    );
    if (matchIndex >= 0) {
      usedCaptions.add(matchIndex);
      pairs += 1;
    }
  }
  return pairs;
}

function figureSignals(snapshot: DocumentSnapshot) {
  const nodes = walkTree(snapshot.structureTree);
  const figureNodes = nodes.filter(node => node.type === 'Figure');
  const nonFigureRoleCount = snapshot.figures.filter(
    figure => normalizeStructType(figure.role) !== '' && normalizeStructType(figure.role) !== 'Figure',
  ).length;
  return {
    extractedFigureCount: snapshot.figures.length,
    treeFigureCount: figureNodes.length,
    nonFigureRoleCount,
    captionCandidateCount: snapshot.layoutAudit?.captionCandidateCount ?? 0,
    figureCaptionPairCount: figureCaptionPairCount(snapshot),
    treeFigureMissingForExtractedFigures:
      snapshot.figures.length > 0 && figureNodes.length === 0,
  };
}

function structureTreeDepth(snapshot: DocumentSnapshot): number {
  const nodes = walkTree(snapshot.structureTree);
  if (nodes.length === 0) return 0;
  return Math.max(...nodes.map(node => node.depth));
}

function normalizeSnippet(text: string | undefined): string {
  return (text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)[0]?.slice(0, 120)
    .toLowerCase() ?? '';
}

function normalizeSuffix(text: string | undefined): string {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1]?.slice(0, 120).toLowerCase() ?? '';
}

function repeatedBoundaryRisk(snapshot: DocumentSnapshot): boolean {
  const prefixCounts = new Map<string, number>();
  const suffixCounts = new Map<string, number>();
  for (const pageText of snapshot.textByPage) {
    const prefix = normalizeSnippet(pageText);
    const suffix = normalizeSuffix(pageText);
    if (prefix.length >= 8) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    if (suffix.length >= 8) suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }
  const repeatedPrefix = [...prefixCounts.values()].some(
    count => count >= STAGE3_HEADER_FOOTER_REPEAT_THRESHOLD,
  );
  const repeatedSuffix = [...suffixCounts.values()].some(
    count => count >= STAGE3_HEADER_FOOTER_REPEAT_THRESHOLD,
  );
  return repeatedPrefix || repeatedSuffix;
}

function suspiciousPages(snapshot: DocumentSnapshot): number[] {
  const paragraphCounts = new Map<number, number>();
  for (const elem of snapshot.paragraphStructElems ?? []) {
    paragraphCounts.set(elem.page, (paragraphCounts.get(elem.page) ?? 0) + 1);
  }

  const pageScores = new Map<number, number>();
  const bump = (page: number, weight: number) => {
    if (page < 0 || page >= snapshot.pageCount) return;
    pageScores.set(page, (pageScores.get(page) ?? 0) + weight);
  };

  for (const heading of snapshot.headings) bump(heading.page, 3);
  for (const table of snapshot.tables) bump(table.page, 3);
  for (const figure of snapshot.figures) bump(figure.page, 2);
  for (const link of snapshot.links) bump(link.page, 1);
  for (const [page, count] of paragraphCounts.entries()) {
    if (count >= STAGE3_PARAGRAPH_DENSITY_THRESHOLD) bump(page, 2);
  }

  const scoredPages = [...pageScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, Math.min(STAGE3_SUSPICIOUS_PAGE_SAMPLE_CAP, snapshot.pageCount))
    .map(([page]) => page);

  if (scoredPages.length > 0) return scoredPages;
  return Array.from({ length: Math.min(snapshot.pageCount, STAGE3_SUSPICIOUS_PAGE_SAMPLE_CAP) }, (_, i) => i);
}

function sampledStructurePageOrderDriftCount(
  snapshot: DocumentSnapshot,
  samplePages: number[],
): number {
  const sampleSet = new Set(samplePages);
  const structured = (snapshot.paragraphStructElems ?? [])
    .filter(elem => sampleSet.has(elem.page))
    .sort((a, b) => a.page - b.page);
  if (structured.length < 2) return 0;

  let drift = 0;
  let previousPage = structured[0]!.page;
  for (let i = 1; i < structured.length; i++) {
    const currentPage = structured[i]!.page;
    if (currentPage + 1 < previousPage) drift++;
    previousPage = currentPage;
  }

  for (let i = 1; i < snapshot.headings.length; i++) {
    const prev = snapshot.headings[i - 1]!;
    const current = snapshot.headings[i]!;
    if (sampleSet.has(prev.page) || sampleSet.has(current.page)) {
      if (current.page + 1 < prev.page) drift++;
    }
  }

  return drift;
}

function multiColumnOrderRiskPages(snapshot: DocumentSnapshot, samplePages: number[]): number {
  const sampleSet = new Set(samplePages);
  const byPage = new Map<number, Array<NonNullable<DocumentSnapshot['paragraphStructElems']>[number]>>();
  for (const elem of snapshot.paragraphStructElems ?? []) {
    if (!sampleSet.has(elem.page) || !elem.bbox) continue;
    const list = byPage.get(elem.page);
    if (list) list.push(elem);
    else byPage.set(elem.page, [elem]);
  }

  let riskyPages = 0;
  for (const elems of byPage.values()) {
    if (elems.length < 4) continue;
    const xs = elems
      .map(elem => elem.bbox?.[0] ?? 0)
      .sort((a, b) => a - b);
    if (xs.length < 2) continue;
    const minX = xs[0] ?? 0;
    const maxX = xs[xs.length - 1] ?? 0;
    if (maxX - minX >= STAGE3_MULTI_COLUMN_X_GAP) riskyPages++;
  }
  return riskyPages;
}

export function deriveDetectionProfile(snapshot: DocumentSnapshot): DetectionProfile {
  const samplePages = suspiciousPages(snapshot);
  const treeDepth = structureTreeDepth(snapshot);
  const heading = headingSignals(snapshot);
  const figure = figureSignals(snapshot);
  const annotationSignals = {
    pagesMissingTabsS: snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0,
    pagesAnnotationOrderDiffers: snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0,
    linkAnnotationsMissingStructure: snapshot.annotationAccessibility?.linkAnnotationsMissingStructure ?? 0,
    nonLinkAnnotationsMissingStructure:
      snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructure ?? 0,
    linkAnnotationsMissingStructParent:
      snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0,
    nonLinkAnnotationsMissingStructParent:
      snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0,
  };

  let tablesWithMisplacedCells = 0;
  let misplacedCellCount = 0;
  let irregularTableCount = 0;
  let stronglyIrregularTableCount = 0;
  for (const table of snapshot.tables) {
    const misplaced = table.cellsMisplacedCount ?? 0;
    const irregularRows = table.irregularRows ?? 0;
    if (misplaced > 0) tablesWithMisplacedCells++;
    if (misplaced > 0) misplacedCellCount += misplaced;
    if (irregularRows > 0) irregularTableCount++;
    if (irregularRows >= STAGE3_TABLE_STRONG_IRREGULAR_ROWS_THRESHOLD) stronglyIrregularTableCount++;
  }

  const detectionProfile: DetectionProfile = {
    readingOrderSignals: {
      missingStructureTree: snapshot.structureTree === null,
      structureTreeDepth: treeDepth,
      degenerateStructureTree:
        snapshot.structureTree !== null &&
        snapshot.pageCount > 1 &&
        (treeDepth <= 1 ||
          (treeDepth <= 2 &&
            ((snapshot.paragraphStructElems?.length ?? 0) >= 3 || (snapshot.textCharCount ?? 0) >= 400))),
      annotationOrderRiskCount: annotationSignals.pagesAnnotationOrderDiffers,
      annotationStructParentRiskCount:
        annotationSignals.linkAnnotationsMissingStructParent +
        annotationSignals.nonLinkAnnotationsMissingStructParent,
      headerFooterPollutionRisk: repeatedBoundaryRisk(snapshot),
      sampledStructurePageOrderDriftCount: sampledStructurePageOrderDriftCount(snapshot, samplePages),
      multiColumnOrderRiskPages: multiColumnOrderRiskPages(snapshot, samplePages),
      geometryOrderRiskPages: snapshot.layoutAudit?.geometryOrderRiskPages ?? 0,
      suspiciousPageCount: samplePages.length,
    },
    headingSignals: {
      ...heading,
      layoutHeadingCandidateCount: snapshot.layoutAudit?.layoutHeadingCandidateCount ?? 0,
    },
    figureSignals: figure,
    pdfUaSignals: {
      orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0,
      suspectedPathPaintOutsideMc: snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0,
      taggedAnnotationRiskCount:
        annotationSignals.linkAnnotationsMissingStructure +
        annotationSignals.nonLinkAnnotationsMissingStructure,
    },
    annotationSignals,
    listSignals: {
      listItemMisplacedCount: snapshot.listStructureAudit?.listItemMisplacedCount ?? 0,
      lblBodyMisplacedCount: snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0,
      listsWithoutItems: snapshot.listStructureAudit?.listsWithoutItems ?? 0,
    },
    tableSignals: {
      tablesWithMisplacedCells,
      misplacedCellCount,
      irregularTableCount,
      stronglyIrregularTableCount,
      directCellUnderTableCount: misplacedCellCount,
      layoutTableCandidateCount: snapshot.layoutAudit?.layoutTableCandidateCount ?? 0,
      denseRowBandTableCandidateCount: snapshot.layoutAudit?.denseRowBandTableCandidateCount ?? 0,
    },
    sampledPages: samplePages,
    confidence: snapshot.structureTree || snapshot.paragraphStructElems?.length ? 'medium' : 'low',
  };

  if (
    snapshot.structureTree !== null &&
    detectionProfile.readingOrderSignals.sampledStructurePageOrderDriftCount === 0 &&
    detectionProfile.readingOrderSignals.multiColumnOrderRiskPages === 0
  ) {
    detectionProfile.confidence = 'high';
  }

  return detectionProfile;
}
