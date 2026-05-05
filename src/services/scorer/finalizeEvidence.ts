import type {
  AnalysisResult,
  CategoryKey,
  DocumentSnapshot,
  EvidenceLevel,
  Finding,
  ScoreCapApplied,
  ScoredCategory,
  VerificationLevel,
} from '../../types.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../compliance/pacRuleEvidence.js';
import { qualifiesForEngineOwnedOcrExtractabilityCredit } from './remediationProvenance.js';

const HEURISTIC_SCORE_CAP = 89;
const PAC_RULE_SCORE_CAP = 89;
const PAC_SCORING_RULE_IDS = new Set([
  'pdfua.metadata.title_present',
  'pdfua.metadata.pdfua_identifier_present',
  'pdfua.settings.marked_true',
  'pdfua.language.document_lang_present',
  'pdfua.structure.struct_tree_present',
  'pdfua.parent_tree.annotation_struct_parent_present',
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.annotations.tab_order_structure',
  'pdfua.annotations.nonlink_contents_present',
  'pdfua.figure.alt_present',
  'pdfua.figure.checker_visible_alt_present',
  'pdfua.form.tu_present',
  'pdfua.annotation.alt_or_contents_present',
  'pdfua.table.headers_present',
  'pdfua.table.cells_nested_under_rows',
  'pdfua.table.rows_regular',
  'pdfua.table.strong_regular_structure',
  'pdfua.content.orphan_mcids_absent',
]);

interface CategoryPolicy {
  evidence: EvidenceLevel;
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
  cap?: number;
  capReason?: string;
}

interface FinalizeScoringResult {
  categories: ScoredCategory[];
  findings: Finding[];
  verificationLevel: VerificationLevel;
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
  scoreCapsApplied: ScoreCapApplied[];
}

interface PacCategoryInfluence {
  rules: PacRuleEvidence[];
  manualReviewReasons: string[];
}

function metadataSuggestsOcrEngine(snap: DocumentSnapshot): boolean {
  const producer = (snap.metadata.producer ?? '').toLowerCase();
  const creator = (snap.metadata.creator ?? '').toLowerCase();
  return (
    producer.includes('ocrmypdf') ||
    creator.includes('ocrmypdf') ||
    producer.includes('tesseract') ||
    creator.includes('tesseract')
  );
}

function categoryHasFinding(category: ScoredCategory, pattern: RegExp): boolean {
  return category.findings.some(finding => pattern.test(finding.message));
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function policyForCategory(snap: DocumentSnapshot, category: ScoredCategory): CategoryPolicy {
  switch (category.key) {
    case 'color_contrast':
      return {
        evidence: 'heuristic',
        manualReviewRequired: true,
        manualReviewReasons: ['Color contrast was not machine-verified because this build does not perform rendered pixel contrast analysis.'],
      };

    case 'reading_order': {
      const missingStructureTree = snap.structureTree === null;
      const degenerateStructureTree = snap.detectionProfile?.readingOrderSignals.degenerateStructureTree === true;
      const annotationSignals =
        (snap.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ||
        (snap.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ||
        (snap.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0 ||
        (snap.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0;
      const heuristicOnly = missingStructureTree;
      const manualReviewReasons: string[] = [];
      if (missingStructureTree) {
        manualReviewReasons.push('Reading order fell back to heading/paragraph heuristics because no structure tree was available.');
      }
      if (degenerateStructureTree) {
        manualReviewReasons.push('Reading order uses a shallow or degenerate structure tree that should be checked manually with assistive technology.');
      }
      if (annotationSignals) {
        manualReviewReasons.push('Annotation tab order or /StructParent issues mean reading order should be checked manually with assistive technology.');
      }
      return {
        evidence: manualReviewReasons.length > 0 ? 'manual_review_required' : heuristicOnly ? 'heuristic' : 'verified',
        manualReviewRequired: manualReviewReasons.length > 0,
        manualReviewReasons,
        ...((heuristicOnly || degenerateStructureTree)
          ? { cap: HEURISTIC_SCORE_CAP, capReason: heuristicOnly ? 'Reading order relies on proxy heuristics without a structure tree.' : 'Reading order depends on a shallow or degenerate structure tree.' }
          : {}),
      };
    }

    case 'text_extractability': {
      if (!metadataSuggestsOcrEngine(snap)) {
        return {
          evidence: 'verified',
          manualReviewRequired: false,
          manualReviewReasons: [],
        };
      }
      if (qualifiesForEngineOwnedOcrExtractabilityCredit(snap)) {
        return {
          evidence: 'manual_review_required',
          manualReviewRequired: true,
          manualReviewReasons: ['PDFAF applied OCR and produced a strong text layer, but OCR recognition accuracy and assistive-technology usability still need manual validation.'],
        };
      }
      return {
        evidence: 'manual_review_required',
        manualReviewRequired: true,
        manualReviewReasons: ['OCR metadata indicates a machine-generated text layer that was not verified for recognition accuracy, logical order, or assistive-technology usability.'],
        cap: HEURISTIC_SCORE_CAP,
        capReason: 'OCR-generated text layers cannot be treated as a full-confidence extractability pass.',
      };
    }

    case 'alt_text': {
      const weakAlt = categoryHasFinding(category, /generic|boilerplate|low-signal/i);
      const ownershipRisks =
        (snap.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0) > 0 ||
        (snap.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0) > 0 ||
        (snap.acrobatStyleAltRisks?.orphanedAltEmptyElementCount ?? 0) > 0 ||
        (snap.detectionProfile?.figureSignals?.nonFigureRoleCount ?? 0) > 0 ||
        snap.detectionProfile?.figureSignals?.treeFigureMissingForExtractedFigures === true;
      const manualReviewReasons: string[] = [];
      if (ownershipRisks) {
        manualReviewReasons.push('Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification.');
      }
      if (weakAlt) {
        manualReviewReasons.push('Some alternate text is generic or low-signal and should be checked manually for meaning.');
      }
      const nonVerified = ownershipRisks || weakAlt;
      return {
        evidence: ownershipRisks ? 'manual_review_required' : weakAlt ? 'heuristic' : 'verified',
        manualReviewRequired: ownershipRisks,
        manualReviewReasons,
        ...(nonVerified ? { cap: HEURISTIC_SCORE_CAP, capReason: 'Alt text quality or ownership evidence is not fully machine-verifiable.' } : {}),
      };
    }

    case 'pdf_ua_compliance': {
      const heuristicSignals =
        snap.structureTree === null && snap.isTagged && snap.headings.length > 0 ||
        (snap.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) > 0;
      const manualReviewRequired = heuristicSignals && (category.score ?? 0) >= HEURISTIC_SCORE_CAP;
      return {
        evidence: manualReviewRequired ? 'manual_review_required' : heuristicSignals ? 'heuristic' : 'verified',
        manualReviewRequired,
        manualReviewReasons: manualReviewRequired
          ? ['PDF/UA compliance includes heuristic proxy signals and should be confirmed with external/manual review before treating as a high-confidence pass.']
          : [],
      };
    }

    default:
      return {
        evidence: 'verified',
        manualReviewRequired: false,
        manualReviewReasons: [],
      };
  }
}

function attachFindingMetadata(
  findings: Finding[],
  evidence: EvidenceLevel,
  manualReviewRequired: boolean,
  manualReviewReasons: string[],
): Finding[] {
  const reason = manualReviewReasons[0];
  return findings.map(finding => ({
    ...finding,
    evidence,
    ...(manualReviewRequired ? { manualReviewRequired: true } : {}),
    ...(reason ? { manualReviewReason: reason } : {}),
  }));
}

function pacInfluenceByCategory(snap: DocumentSnapshot): Map<CategoryKey, PacCategoryInfluence> {
  const out = new Map<CategoryKey, PacCategoryInfluence>();
  const selected = buildPacRuleEvidence(snap)
    .filter(rule =>
      PAC_SCORING_RULE_IDS.has(rule.ruleId) &&
      rule.status === 'fail' &&
      rule.confidence === 'verified'
    )
    .sort((a, b) => a.category.localeCompare(b.category) || a.ruleId.localeCompare(b.ruleId));
  for (const rule of selected) {
    const existing = out.get(rule.category) ?? { rules: [], manualReviewReasons: [] };
    existing.rules.push(rule);
    existing.manualReviewReasons.push(`PAC rule failure requires manual review: ${rule.ruleId}.`);
    out.set(rule.category, existing);
  }
  return out;
}

function finalizeCategory(
  snap: DocumentSnapshot,
  category: ScoredCategory,
  pacInfluence?: PacCategoryInfluence,
): ScoredCategory {
  const policy = policyForCategory(snap, category);
  const scoreCapsApplied: ScoreCapApplied[] = [];
  let finalScore = category.score;
  if (category.applicable && policy.cap !== undefined && typeof category.score === 'number' && category.score > policy.cap) {
    finalScore = policy.cap;
    scoreCapsApplied.push({
      category: category.key,
      cap: policy.cap,
      rawScore: category.score,
      finalScore: finalScore ?? policy.cap,
      reason: policy.capReason ?? 'Stage 1 heuristic evidence cap applied.',
    });
  }
  const applicablePacInfluence = category.applicable && pacInfluence ? pacInfluence : undefined;
  if (
    applicablePacInfluence &&
    typeof category.score === 'number' &&
    category.score > PAC_RULE_SCORE_CAP
  ) {
    finalScore = Math.min(finalScore ?? PAC_RULE_SCORE_CAP, PAC_RULE_SCORE_CAP);
    for (const pacRule of applicablePacInfluence.rules) {
      scoreCapsApplied.push({
        category: category.key,
        cap: PAC_RULE_SCORE_CAP,
        rawScore: category.score,
        finalScore: PAC_RULE_SCORE_CAP,
        reason: `PAC rule failure: ${pacRule.ruleId}`,
      });
    }
  }

  const manualReviewRequired = policy.manualReviewRequired || Boolean(applicablePacInfluence);
  const manualReviewReasons = uniq([
    ...policy.manualReviewReasons,
    ...(applicablePacInfluence?.manualReviewReasons ?? []),
  ]);
  const evidence: EvidenceLevel =
    applicablePacInfluence
      ? 'manual_review_required'
      : policy.evidence;

  const verificationLevel: VerificationLevel =
    manualReviewRequired
      ? 'manual_review_required'
      : evidence === 'verified'
        ? 'verified'
        : 'heuristic';

  return {
    ...category,
    score: finalScore,
    findings: attachFindingMetadata(
      category.findings,
      evidence,
      manualReviewRequired,
      manualReviewReasons,
    ),
    evidence,
    verificationLevel,
    manualReviewRequired,
    manualReviewReasons,
    ...(scoreCapsApplied.length > 0 ? { scoreCapsApplied } : {}),
  };
}

function topLevelVerificationLevel(categories: ScoredCategory[]): VerificationLevel {
  const applicable = categories.filter(category => category.applicable);
  if (applicable.some(category => category.manualReviewRequired)) {
    return 'manual_review_required';
  }
  const hasVerified = categories.some(category => category.evidence === 'verified');
  const hasNonVerified = categories.some(category => category.evidence !== 'verified');
  if (!hasNonVerified) return 'verified';
  if (hasVerified) return 'mixed';
  return 'heuristic';
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
  pass: 3,
};

function findingSortOrder(a: Finding, b: Finding): number {
  return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
}

export function finalizeScoringEvidence(
  snap: DocumentSnapshot,
  categories: ScoredCategory[],
): FinalizeScoringResult {
  const pacByCategory = pacInfluenceByCategory(snap);
  const finalizedCategories = categories.map(category => finalizeCategory(snap, category, pacByCategory.get(category.key)));
  const findings = finalizedCategories
    .flatMap(category => category.findings)
    .sort(findingSortOrder);
  const manualReviewReasons = uniq(
    finalizedCategories.flatMap(category => category.manualReviewReasons ?? []),
  );
  const scoreCapsApplied = finalizedCategories.flatMap(category => category.scoreCapsApplied ?? []);

  return {
    categories: finalizedCategories,
    findings,
    verificationLevel: topLevelVerificationLevel(finalizedCategories),
    manualReviewRequired: finalizedCategories.some(category => category.applicable && category.manualReviewRequired),
    manualReviewReasons,
    scoreCapsApplied,
  };
}

export function buildAnalysisVerificationSummary(
  analysis: AnalysisResult,
): Pick<AnalysisResult, 'verificationLevel' | 'manualReviewRequired' | 'manualReviewReasons' | 'scoreCapsApplied'> {
  return {
    verificationLevel: analysis.verificationLevel ?? 'verified',
    manualReviewRequired: analysis.manualReviewRequired ?? false,
    manualReviewReasons: analysis.manualReviewReasons ?? [],
    scoreCapsApplied: analysis.scoreCapsApplied ?? [],
  };
}
