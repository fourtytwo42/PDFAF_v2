import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type {
  AnalysisResult,
  CategoryKey,
  DocumentSnapshot,
  FailureFamily,
  FailureProfile,
  FailureRoutingHint,
  StructuralClassification,
  StructureClass,
} from '../../types.js';

function metadataSuggestsOcrEngine(snapshot: DocumentSnapshot): boolean {
  const producer = (snapshot.metadata.producer ?? '').toLowerCase();
  const creator = (snapshot.metadata.creator ?? '').toLowerCase();
  return (
    producer.includes('ocrmypdf') ||
    creator.includes('ocrmypdf') ||
    producer.includes('tesseract') ||
    creator.includes('tesseract')
  );
}

function pageBucket(pageCount: number): StructuralClassification['contentProfile']['pageBucket'] {
  if (pageCount <= 5) return '1-5';
  if (pageCount <= 20) return '6-20';
  if (pageCount <= 50) return '21-50';
  return '50+';
}

function dominantContent(snapshot: DocumentSnapshot): StructuralClassification['contentProfile']['dominantContent'] {
  if (snapshot.imageToTextRatio >= 0.8 || snapshot.textCharCount === 0) return 'image_heavy';
  if (snapshot.imageToTextRatio >= 0.3) return 'mixed';
  return 'text';
}

function hasStructuralDebt(snapshot: DocumentSnapshot, analysis: AnalysisResult): boolean {
  const category = new Map(analysis.categories.map(item => [item.key, item]));
  const readingOrder = category.get('reading_order');
  const pdfUa = category.get('pdf_ua_compliance');
  const annotationRisk =
    (snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0;
  const taggedContentRisk =
    (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ||
    (snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) > 0;
  const listRisk =
    (snapshot.listStructureAudit?.listItemMisplacedCount ?? 0) > 0 ||
    (snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0) > 0 ||
    (snapshot.listStructureAudit?.listsWithoutItems ?? 0) > 0;

  return (
    readingOrder?.manualReviewRequired === true ||
    pdfUa?.manualReviewRequired === true ||
    annotationRisk ||
    taggedContentRisk ||
    listRisk
  );
}

function structureClass(snapshot: DocumentSnapshot, analysis: AnalysisResult): StructureClass {
  const scannedLike =
    snapshot.pdfClass === 'scanned' ||
    (snapshot.textCharCount === 0 && snapshot.imageToTextRatio >= 0.8);
  if (scannedLike) return 'scanned';

  const hasTree = snapshot.structureTree !== null;
  const hasTaggedSignals = snapshot.isTagged || snapshot.markInfo?.Marked === true;

  if (!hasTree && !hasTaggedSignals) return 'untagged_digital';
  if (!hasTree && hasTaggedSignals) return 'partially_tagged';

  if (hasStructuralDebt(snapshot, analysis)) return 'partially_tagged';

  const category = new Map(analysis.categories.map(item => [item.key, item]));
  const readingOrder = category.get('reading_order');
  const pdfUa = category.get('pdf_ua_compliance');
  const strongStructure =
    snapshot.isTagged &&
    hasTree &&
    snapshot.markInfo?.Marked === true &&
    readingOrder?.manualReviewRequired !== true &&
    pdfUa?.manualReviewRequired !== true &&
    (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) === 0 &&
    (snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) === 0 &&
    (snapshot.listStructureAudit?.listItemMisplacedCount ?? 0) === 0 &&
    (snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0) === 0 &&
    (snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) === 0 &&
    (snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) === 0 &&
    (snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) === 0 &&
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) === 0;

  return strongStructure ? 'well_tagged' : 'native_tagged';
}

function fontRiskProfile(snapshot: DocumentSnapshot): StructuralClassification['fontRiskProfile'] {
  const riskyFontCount = snapshot.fonts.filter(font => font.encodingRisk).length;
  const missingUnicodeFontCount = snapshot.fonts.filter(font => !font.hasUnicode).length;
  const unembeddedFontCount = snapshot.fonts.filter(font => !font.isEmbedded).length;
  const ocrTextLayerSuspected = metadataSuggestsOcrEngine(snapshot);
  const riskScore = riskyFontCount + missingUnicodeFontCount + unembeddedFontCount + (ocrTextLayerSuspected ? 2 : 0);

  return {
    riskLevel: riskScore >= 5 ? 'high' : riskScore >= 2 ? 'medium' : 'low',
    riskyFontCount,
    missingUnicodeFontCount,
    unembeddedFontCount,
    ocrTextLayerSuspected,
  };
}

function structuralClassification(snapshot: DocumentSnapshot, analysis: AnalysisResult): StructuralClassification {
  const derivedStructureClass = structureClass(snapshot, analysis);
  const content = dominantContent(snapshot);
  const annotationRisk =
    (snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0;
  const taggedContentRisk =
    (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ||
    (snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) > 0;
  const listStructureRisk =
    (snapshot.listStructureAudit?.listItemMisplacedCount ?? 0) > 0 ||
    (snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0) > 0 ||
    (snapshot.listStructureAudit?.listsWithoutItems ?? 0) > 0;

  return {
    structureClass: derivedStructureClass,
    contentProfile: {
      pageBucket: pageBucket(snapshot.pageCount),
      dominantContent: content,
      hasStructureTree: snapshot.structureTree !== null,
      hasBookmarks: snapshot.bookmarks.length > 0,
      hasFigures: snapshot.figures.length > 0,
      hasTables: snapshot.tables.length > 0,
      hasForms: snapshot.formFields.length > 0 || snapshot.formFieldsFromPdfjs.length > 0,
      annotationRisk,
      taggedContentRisk,
      listStructureRisk,
    },
    fontRiskProfile: fontRiskProfile(snapshot),
    confidence:
      derivedStructureClass === 'scanned' || derivedStructureClass === 'well_tagged'
        ? 'high'
        : derivedStructureClass === 'untagged_digital'
          ? 'high'
          : 'medium',
  };
}

function failingApplicableCategories(analysis: AnalysisResult): CategoryKey[] {
  return analysis.categories
    .filter(category => category.applicable && category.score < REMEDIATION_CATEGORY_THRESHOLD)
    .map(category => category.key);
}

function deterministicIssues(snapshot: DocumentSnapshot, analysis: AnalysisResult): string[] {
  const issues = new Set<string>();
  for (const key of failingApplicableCategories(analysis)) {
    if (key === 'alt_text') continue;
    issues.add(key);
  }
  if ((snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0) issues.add('annotation_tabs');
  if ((snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0) issues.add('annotation_order');
  if ((snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0) issues.add('annotation_struct_parent');
  if ((snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0) issues.add('tagged_content_orphans');
  if ((snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) > 0) issues.add('tagged_content_paint');
  if ((snapshot.listStructureAudit?.listItemMisplacedCount ?? 0) > 0) issues.add('list_item_structure');
  if ((snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0) > 0) issues.add('list_label_body_structure');
  if ((snapshot.listStructureAudit?.listsWithoutItems ?? 0) > 0) issues.add('empty_lists');
  return [...issues].sort((a, b) => a.localeCompare(b));
}

function semanticIssues(snapshot: DocumentSnapshot, analysis: AnalysisResult): string[] {
  const issues = new Set<string>();
  const altText = analysis.categories.find(category => category.key === 'alt_text');
  if (
    altText?.applicable &&
    (altText.score < REMEDIATION_CATEGORY_THRESHOLD || altText.evidence !== 'verified')
  ) {
    issues.add('alt_text');
  }
  if (snapshot.figures.length > 0 && snapshot.figures.some(figure => !figure.hasAlt && !figure.isArtifact)) {
    issues.add('figure_meaning');
  }
  return [...issues].sort((a, b) => a.localeCompare(b));
}

function manualOnlyIssues(analysis: AnalysisResult): string[] {
  return analysis.categories
    .filter(category => category.applicable && category.manualReviewRequired)
    .map(category => category.key)
    .sort((a, b) => a.localeCompare(b));
}

function familyScores(snapshot: DocumentSnapshot, analysis: AnalysisResult): Record<FailureFamily, number> {
  const category = new Map(analysis.categories.map(item => [item.key, item]));
  const readingOrder = category.get('reading_order');
  const pdfUa = category.get('pdf_ua_compliance');
  const textExtractability = category.get('text_extractability');
  const altText = category.get('alt_text');
  const titleLanguage = category.get('title_language');
  const fontProfile = fontRiskProfile(snapshot);

  const structureSignals =
    (readingOrder?.manualReviewRequired ? 3 : readingOrder && readingOrder.score < REMEDIATION_CATEGORY_THRESHOLD ? 2 : 0) +
    (pdfUa?.manualReviewRequired ? 2 : pdfUa && pdfUa.score < REMEDIATION_CATEGORY_THRESHOLD ? 1 : 0) +
    ((snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ? 1 : 0) +
    ((snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ? 1 : 0) +
    ((snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0 ? 1 : 0) +
    ((snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0 ? 1 : 0) +
    ((snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ? 1 : 0) +
    ((snapshot.listStructureAudit?.listItemMisplacedCount ?? 0) > 0 ? 1 : 0) +
    ((snapshot.listStructureAudit?.lblBodyMisplacedCount ?? 0) > 0 ? 1 : 0);

  const fontSignals =
    (textExtractability?.manualReviewRequired ? 3 : textExtractability && textExtractability.score < REMEDIATION_CATEGORY_THRESHOLD ? 2 : 0) +
    (fontProfile.riskLevel === 'high' ? 2 : fontProfile.riskLevel === 'medium' ? 1 : 0) +
    (fontProfile.ocrTextLayerSuspected ? 2 : 0);

  const figureSignals =
    (altText?.manualReviewRequired ? 3 : altText && altText.score < REMEDIATION_CATEGORY_THRESHOLD ? 2 : 0) +
    ((snapshot.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0) > 0 ? 1 : 0) +
    ((snapshot.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0) > 0 ? 1 : 0) +
    ((snapshot.acrobatStyleAltRisks?.orphanedAltEmptyElementCount ?? 0) > 0 ? 1 : 0);

  const metadataSignals =
    titleLanguage && titleLanguage.applicable && titleLanguage.score < REMEDIATION_CATEGORY_THRESHOLD ? 2 : 0;

  const nearPassSignals =
    analysis.score >= 85
      ? 3 - Math.min(2, manualOnlyIssues(analysis).length + failingApplicableCategories(analysis).length)
      : 0;

  return {
    font_extractability_heavy: fontSignals,
    structure_reading_order_heavy: structureSignals,
    figure_alt_ownership_heavy: figureSignals,
    metadata_language_heavy: metadataSignals,
    mixed_structural: structureSignals > 0 && figureSignals > 0 ? 2 : 0,
    near_pass_residual: Math.max(0, nearPassSignals),
  };
}

function chooseFamilies(snapshot: DocumentSnapshot, analysis: AnalysisResult): {
  primaryFailureFamily: FailureFamily;
  secondaryFailureFamilies: FailureFamily[];
} {
  const scores = familyScores(snapshot, analysis);
  const entries = (Object.entries(scores) as Array<[FailureFamily, number]>)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const top = entries[0];
  if (!top || top[1] <= 0) {
    return {
      primaryFailureFamily: analysis.score >= 85 ? 'near_pass_residual' : 'mixed_structural',
      secondaryFailureFamilies: [],
    };
  }

  const positive = entries.filter(([, score]) => score > 0).map(([family]) => family);
  if (positive.length > 1 && top[1] - (entries[1]?.[1] ?? 0) <= 1 && top[0] !== 'near_pass_residual') {
    return {
      primaryFailureFamily: 'mixed_structural',
      secondaryFailureFamilies: positive.filter(family => family !== 'mixed_structural'),
    };
  }

  return {
    primaryFailureFamily: top[0],
    secondaryFailureFamilies: positive.filter(family => family !== top[0]),
  };
}

function routingHints(
  snapshot: DocumentSnapshot,
  analysis: AnalysisResult,
  primaryFailureFamily: FailureFamily,
): FailureRoutingHint[] {
  const hints = new Set<FailureRoutingHint>();
  if (
    primaryFailureFamily === 'structure_reading_order_heavy' ||
    primaryFailureFamily === 'mixed_structural'
  ) {
    hints.add('prefer_structure_bootstrap');
  }
  if (
    (snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0
  ) {
    hints.add('prefer_annotation_normalization');
  }
  if (primaryFailureFamily === 'font_extractability_heavy') {
    hints.add('prefer_font_repair');
  }
  if (primaryFailureFamily !== 'figure_alt_ownership_heavy') {
    hints.add('semantic_not_primary');
  }
  if (analysis.manualReviewRequired === true) {
    hints.add('manual_review_likely_after_fix');
  }
  return [...hints].sort((a, b) => a.localeCompare(b));
}

function failureProfile(snapshot: DocumentSnapshot, analysis: AnalysisResult): FailureProfile {
  const deterministic = deterministicIssues(snapshot, analysis);
  const semantic = semanticIssues(snapshot, analysis);
  const manual = manualOnlyIssues(analysis);
  const families = chooseFamilies(snapshot, analysis);

  return {
    deterministicIssues: deterministic,
    semanticIssues: semantic,
    manualOnlyIssues: manual,
    primaryFailureFamily: families.primaryFailureFamily,
    secondaryFailureFamilies: families.secondaryFailureFamilies,
    routingHints: routingHints(snapshot, analysis, families.primaryFailureFamily),
  };
}

export function deriveAnalysisClassification(
  snapshot: DocumentSnapshot,
  analysis: AnalysisResult,
): Pick<AnalysisResult, 'structuralClassification' | 'failureProfile'> {
  return {
    structuralClassification: structuralClassification(snapshot, analysis),
    failureProfile: failureProfile(snapshot, analysis),
  };
}
