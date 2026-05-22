import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
} from '../../types.js';

export type Stage180MixedClass =
  | 'stable_table_first_candidate'
  | 'rolemap_alt_after_table_candidate'
  | 'pdfua_cleanup_after_category_gain_candidate'
  | 'mixed_ordered_transaction_candidate'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_target';

export interface Stage180TableTarget {
  structRef: string;
  page: number;
  irregularRows: number;
  dominantColumnCount: number;
  totalCells: number;
  rowCount: number;
  headerCount: number;
  subtreeMcidCount: number;
  smallDominantFallback: boolean;
}

export interface Stage180Decision {
  classification: Stage180MixedClass;
  shouldAttempt: boolean;
  reason: string;
  tableTargets: Stage180TableTarget[];
  annotationDebt: number;
  orphanMcidCount: number;
}

const STAGE180_MAX_TABLE_TARGETS = 2;
const STAGE180_MAX_LINK_OWNERSHIP_DEBT = 40;
const STAGE180_REPORT_TABLE_MIN_HEADER_DEBT = 100;
const STAGE180_REPORT_TABLE_MIN_PAGES = 20;
const STAGE180_REPORT_TABLE_MIN_SUBTREE_MCIDS = 50;

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mutationTargetRef(row: AppliedRemediationTool): string | null {
  const parsed = parseDetails(row.details);
  const invariants = nestedRecord(parsed, 'invariants');
  if (typeof invariants?.targetRef === 'string') return invariants.targetRef;
  const debug = nestedRecord(parsed, 'debug');
  if (typeof debug?.targetRef === 'string') return debug.targetRef;
  const replayState = nestedRecord(debug, 'replayState');
  if (typeof replayState?.targetRef === 'string') return replayState.targetRef;
  return null;
}

function attemptedTableRefs(appliedTools: readonly AppliedRemediationTool[]): Set<string> {
  return new Set(
    appliedTools
      .filter(row => row.toolName === 'normalize_table_structure')
      .map(mutationTargetRef)
      .filter((ref): ref is string => Boolean(ref)),
  );
}

function annotationDebt(snapshot: DocumentSnapshot): number {
  const annotation = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  return (
    (annotation?.linkAnnotationsMissingStructure ?? detection?.linkAnnotationsMissingStructure ?? 0) +
    (annotation?.linkAnnotationsMissingStructParent ?? detection?.linkAnnotationsMissingStructParent ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructure ?? detection?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructParent ?? detection?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
}

function tableHeaderAssociationDebt(snapshot: DocumentSnapshot): number {
  const audit = snapshot.tableHeaderAudit;
  if (!audit || audit.tablesChecked <= 0) return 0;
  return (
    Math.max(0, audit.headerAssociationMissingCount ?? 0) +
    Math.max(0, audit.dataCellsWithoutHeaderCount ?? 0) +
    Math.max(0, audit.orphanHeaderCellCount ?? 0)
  );
}

function hasDirectOrMisplacedTableShape(snapshot: DocumentSnapshot): boolean {
  const tableSignals = snapshot.detectionProfile?.tableSignals;
  return Boolean(tableSignals && (
    (tableSignals.directCellUnderTableCount ?? 0) > 0 ||
    (tableSignals.misplacedCellCount ?? 0) > 0
  ));
}

function hasReportScaleObjectBackedTableTarget(
  snapshot: DocumentSnapshot,
  tableTargets: readonly Stage180TableTarget[],
): boolean {
  if ((snapshot.pageCount ?? 0) < STAGE180_REPORT_TABLE_MIN_PAGES) return false;
  return tableTargets.some(target =>
    target.rowCount >= 8 &&
    target.totalCells >= 30 &&
    target.irregularRows >= 5 &&
    target.headerCount >= 1 &&
    target.subtreeMcidCount >= STAGE180_REPORT_TABLE_MIN_SUBTREE_MCIDS
  );
}

export function shouldTryStage180ReportTableProof(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  tableTargets?: readonly Stage180TableTarget[];
  annotationDebt?: number;
  headerAssociationDebt?: number;
  directOrMisplacedTableShape?: boolean;
}): boolean {
  const tableTargets = input.tableTargets ?? stage180RemainingTableTargets(input.snapshot);
  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  const annDebt = input.annotationDebt ?? annotationDebt(input.snapshot);
  const headerDebt = input.headerAssociationDebt ?? tableHeaderAssociationDebt(input.snapshot);
  const directOrMisplaced = input.directOrMisplacedTableShape ?? hasDirectOrMisplacedTableShape(input.snapshot);

  return (
    input.analysis.score < 95 &&
    table < 80 &&
    alt >= 90 &&
    heading >= 60 &&
    reading >= 95 &&
    link >= 95 &&
    annDebt === 0 &&
    headerDebt >= STAGE180_REPORT_TABLE_MIN_HEADER_DEBT &&
    !directOrMisplaced &&
    hasReportScaleObjectBackedTableTarget(input.snapshot, tableTargets)
  );
}

export function hasAppliedStage180MixedTablePdfUa(appliedTools: readonly AppliedRemediationTool[]): boolean {
  return appliedTools.some(tool =>
    tool.outcome === 'applied' &&
    typeof tool.details === 'string' &&
    tool.details.includes('stage180_')
  );
}

export function stage180RemainingTableTargets(
  snapshot: DocumentSnapshot,
  appliedTools: readonly AppliedRemediationTool[] = [],
): Stage180TableTarget[] {
  const attempted = attemptedTableRefs(appliedTools);
  return snapshot.tables
    .filter(table => {
      if (!table.structRef || attempted.has(table.structRef)) return false;
      if (table.reachable !== true) return false;
      if (!table.hasHeaders) return false;
      if ((table.cellsMisplacedCount ?? 0) !== 0) return false;
      if ((table.rowCount ?? 0) <= 1) return false;
      if ((table.irregularRows ?? 0) < 2) return false;
      if ((table.subtreeMcidCount ?? 0) <= 0) return false;
      const dominant = table.dominantColumnCount ?? 0;
      if (dominant >= 2) return true;
      return (
        (table.totalCells ?? 0) <= 8 &&
        (table.rowCount ?? 0) >= 3 &&
        (table.headerCount ?? 0) >= 1 &&
        (table.subtreeMcidCount ?? 0) >= (table.totalCells ?? 0)
      );
    })
    .sort((a, b) =>
      Number((b.dominantColumnCount ?? 0) >= 2) - Number((a.dominantColumnCount ?? 0) >= 2) ||
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      a.page - b.page ||
      (a.structRef ?? '').localeCompare(b.structRef ?? '')
    )
    .slice(0, STAGE180_MAX_TABLE_TARGETS)
    .map(table => {
      const dominant = table.dominantColumnCount ?? 0;
      return {
        structRef: table.structRef!,
        page: table.page,
        irregularRows: table.irregularRows ?? 0,
        dominantColumnCount: dominant >= 2 ? dominant : 2,
        totalCells: table.totalCells,
        rowCount: table.rowCount ?? 0,
        headerCount: table.headerCount ?? 0,
        subtreeMcidCount: table.subtreeMcidCount ?? 0,
        smallDominantFallback: dominant < 2,
      };
    });
}

export function classifyStage180MixedTablePdfUa(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage180Decision {
  const tableTargets = stage180RemainingTableTargets(input.snapshot, input.appliedTools ?? []);
  const annDebt = annotationDebt(input.snapshot);
  const orphanMcidCount =
    input.snapshot.taggedContentAudit?.orphanMcidCount ??
    input.snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
    input.snapshot.orphanMcids?.length ??
    0;
  if (input.parked) {
    return {
      classification: 'protected_or_analyzer_volatility',
      shouldAttempt: false,
      reason: 'parked protected/analyzer-volatility row',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if ((input.falsePositiveApplied ?? 0) > 0) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'false-positive-applied evidence present',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'scanned row not a Stage 180 native mixed target',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'no tagged structure tree',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }

  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  const pdfua = categoryScore(input.analysis, 'pdf_ua_compliance') ?? 100;
  const directOrMisplacedTableShape = hasDirectOrMisplacedTableShape(input.snapshot);
  const headerAssociationDebt = tableHeaderAssociationDebt(input.snapshot);
  const moderateTableOnlyCore =
    table < 80 &&
    alt >= 90 &&
    heading >= 70 &&
    reading >= 75 &&
    link >= 75 &&
    annDebt === 0 &&
    headerAssociationDebt > 0 &&
    !directOrMisplacedTableShape &&
    tableTargets.length > 0;
  const reportScaleObjectBackedTableProof = shouldTryStage180ReportTableProof({
    analysis: input.analysis,
    snapshot: input.snapshot,
    tableTargets,
    annotationDebt: annDebt,
    headerAssociationDebt,
    directOrMisplacedTableShape,
  });
  if (heading < 80 || reading < 80 || link < 80) {
    if (moderateTableOnlyCore || reportScaleObjectBackedTableProof) {
      return {
        classification: 'stable_table_first_candidate',
        shouldAttempt: true,
        reason: reportScaleObjectBackedTableProof
          ? 'report-scale object-backed table cleanup can run with bounded heading debt'
          : 'bounded table-only cleanup can run despite moderate non-table scores',
        tableTargets,
        annotationDebt: annDebt,
        orphanMcidCount,
      };
    }
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: `core categories are not stable enough (${heading}/${reading}/${link})`,
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (table >= 80 && annDebt > 0 && pdfua < 90) {
    return {
      classification: 'pdfua_cleanup_after_category_gain_candidate',
      shouldAttempt: false,
      reason: 'table is already stable; only PDF/UA cleanup remains',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (tableTargets.length === 0) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'no explicit content-backed irregular table targets remain',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (table < 80 && alt < 80 && pdfua < 80 && (annDebt > 0 || orphanMcidCount > 0)) {
    return {
      classification: 'mixed_ordered_transaction_candidate',
      shouldAttempt: true,
      reason: 'table-first mixed target with PDF/UA/link cleanup evidence',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  if (table < 80) {
    return {
      classification: 'stable_table_first_candidate',
      shouldAttempt: true,
      reason: 'explicit table continuation can be tested before any other family',
      tableTargets,
      annotationDebt: annDebt,
      orphanMcidCount,
    };
  }
  return {
    classification: 'no_safe_target',
    shouldAttempt: false,
    reason: 'no Stage 180 table-first target',
    tableTargets,
    annotationDebt: annDebt,
    orphanMcidCount,
  };
}

export function shouldTryStage180LinkRepairAfterTable(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}): boolean {
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') return false;
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) return false;
  if ((input.snapshot.textCharCount ?? 0) <= 0) return false;
  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const table = categoryScore(input.analysis, 'table_markup') ?? 0;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const pdfua = categoryScore(input.analysis, 'pdf_ua_compliance') ?? 100;
  const debt = annotationDebt(input.snapshot);
  return (
    heading >= 80 &&
    reading >= 80 &&
    table >= 80 &&
    debt > 0 &&
    debt <= STAGE180_MAX_LINK_OWNERSHIP_DEBT &&
    (link < 100 || pdfua < 90)
  );
}
