import { createHash } from 'node:crypto';
import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import { deriveAnalysisClassification } from '../classification/analysisClassification.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  PdfClass,
  CategoryKey,
  FailureFamily,
  StructureClass,
} from '../../types.js';

/** Portable fields hashed for playbook matching (no filenames, ids, or raw scores). */
export interface FailureSignature {
  pdfClass: PdfClass;
  failingCategories: CategoryKey[];
  isScanned: boolean;
  hasStructureTree: boolean;
  estimatedPageRange: '1-5' | '6-20' | '21-50' | '50+';
}

export interface FailureSignatureDescription {
  signature: FailureSignature;
  structureClass: StructureClass;
  primaryFailureFamily: FailureFamily;
  deterministicIssues: string[];
  manualOnlyIssues: string[];
}

function classifyPageCount(pageCount: number): FailureSignature['estimatedPageRange'] {
  if (pageCount <= 5) return '1-5';
  if (pageCount <= 20) return '6-20';
  if (pageCount <= 50) return '21-50';
  return '50+';
}

/**
 * Failing categories use the same threshold as remediation planning (`REMEDIATION_CATEGORY_THRESHOLD`).
 */
export function describeSignature(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): FailureSignature {
  const failingCategories = analysis.categories
    .filter(c => c.applicable && c.score < REMEDIATION_CATEGORY_THRESHOLD)
    .map(c => c.key)
    .sort((a, b) => a.localeCompare(b));

  return {
    pdfClass: analysis.pdfClass,
    failingCategories,
    isScanned: analysis.pdfClass === 'scanned',
    hasStructureTree: snapshot.structureTree != null,
    estimatedPageRange: classifyPageCount(analysis.pageCount),
  };
}

export function describeSignatureContext(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): FailureSignatureDescription {
  const stage2 = {
    structuralClassification: analysis.structuralClassification,
    failureProfile: analysis.failureProfile,
  };
  const derived =
    stage2.structuralClassification && stage2.failureProfile
      ? stage2
      : deriveAnalysisClassification(snapshot, analysis);

  return {
    signature: describeSignature(analysis, snapshot),
    structureClass: derived.structuralClassification!.structureClass,
    primaryFailureFamily: derived.failureProfile!.primaryFailureFamily,
    deterministicIssues: derived.failureProfile!.deterministicIssues,
    manualOnlyIssues: derived.failureProfile!.manualOnlyIssues,
  };
}

/** Stable 16-char hash for SQLite playbook row keys. */
export function buildFailureSignature(analysis: AnalysisResult, snapshot: DocumentSnapshot): string {
  const sig = describeSignature(analysis, snapshot);
  return createHash('sha256').update(JSON.stringify(sig)).digest('hex').slice(0, 16);
}
