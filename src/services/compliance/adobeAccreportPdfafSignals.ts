/**
 * When Adobe Accessibility Checker reports a **Failed** rule, PDFAF should surface a related
 * signal (snapshot counts, category scores, or findings) for parity tracking and regression scripts.
 */

import type { AnalysisResult, DocumentSnapshot, Finding } from '../../types.js';
import { BOOKMARKS_PAGE_THRESHOLD, PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD } from '../../config.js';

export interface AdobePdfafSignalResult {
  ok: boolean;
  matched: string[];
  detail: string;
  /** Acrobat anchor has no PDFAF-side assertion yet (do not fail regression by default). */
  unmapped?: boolean;
  /** Acrobat Failed but PDFAF met lenient score floor (parity gap; script may warn instead of failing). */
  parityGap?: boolean;
}

export interface PdfafAdobeSignalOptions {
  /**
   * When Acrobat reports Failed but PDFAF has no matching signal, still return ok if the weighted
   * score is at least this value (typical engine-pass PDFs vs strict Acrobat).
   */
  lenientWhenScoreAtLeast?: number;
}

function allFindings(analysis: AnalysisResult): Finding[] {
  return analysis.findings;
}

function findingMatches(analysis: AnalysisResult, pred: (f: Finding) => boolean): boolean {
  return allFindings(analysis).some(pred);
}

function category(analysis: AnalysisResult, key: string) {
  return analysis.categories.find(c => c.key === key);
}

const UNMAPPED_ADOBE_FAILURE_ANCHORS = new Set<string>([
  'LogicalRO',
  'ColorContrast',
  'Perms',
  'ImageOnlyPDF',
  'FlickerRate',
  'Scripts',
  'TimedResponses',
  'NavLinks',
  'Multimedia',
  'PrimeLang',
]);

/** Acrobat FigAltText / NestedAltText / etc. often fires on scanned or image-heavy pages without Figure tags. */
function imageHeavyAltProxy(snap: DocumentSnapshot): string[] {
  const matched: string[] = [];
  if (snap.pdfClass === 'scanned' || snap.pdfClass === 'mixed') matched.push(`pdfClass=${snap.pdfClass}`);
  if ((snap.imageToTextRatio ?? 0) >= 0.05) matched.push(`imageToTextRatio=${snap.imageToTextRatio}`);
  if ((snap.imageOnlyPageCount ?? 0) > 0) matched.push(`imageOnlyPageCount=${snap.imageOnlyPageCount}`);
  return matched;
}

function taggedPdfSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  if (!snap.isTagged) matched.push('!isTagged');
  if (!snap.markInfo?.Marked) matched.push('MarkInfo.Marked!=true');
  if (snap.structureTree == null) matched.push('no structureTree');
  const pdfUa = category(analysis, 'pdf_ua_compliance');
  if (pdfUa?.applicable && pdfUa.score < 100) matched.push(`pdf_ua.score=${pdfUa.score}`);
  if (findingMatches(analysis, f => f.category === 'pdf_ua_compliance' && /tagged|\/Marked|structure tree|MarkInfo/i.test(f.message))) {
    matched.push('finding:pdf_ua/tagged');
  }
  if (snap.pdfClass === 'native_untagged' || snap.pdfClass === 'scanned') matched.push(`pdfClass=${snap.pdfClass}`);
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected tagging/MarkInfo/structure/pdf_ua signals for Acrobat TaggedPDF failure.',
    };
  }
  return { ok: true, matched, detail: '' };
}

function docTitleSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const hasTitle = !!(snap.metadata.title?.trim() || snap.structTitle?.trim());
  if (!hasTitle) matched.push('no /Title or structTitle');
  const tl = category(analysis, 'title_language');
  if (tl && tl.score < 100) matched.push(`title_language.score=${tl.score}`);
  if (findingMatches(analysis, f => f.category === 'title_language' && /title|Title bar|\/Title/i.test(f.message))) {
    matched.push('finding:title');
  }
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected missing title or title_language findings (DocTitle).' };
  }
  return { ok: true, matched, detail: '' };
}

function taggedContSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const tca = snap.taggedContentAudit;
  const orphans = tca?.orphanMcidCount ?? 0;
  const paths = tca?.suspectedPathPaintOutsideMc ?? 0;
  const orphanList = snap.orphanMcids?.length ?? 0;

  if (!snap.isTagged) matched.push('!isTagged');
  if (snap.structureTree == null) matched.push('no structureTree');
  const pdfUa = category(analysis, 'pdf_ua_compliance');
  if (pdfUa?.applicable && pdfUa.score < 100) matched.push(`pdf_ua.score=${pdfUa.score}`);
  if (findingMatches(analysis, f => f.category === 'pdf_ua_compliance' && /orphan|path paint|marked-content|structure|tagged/i.test(f.message))) {
    matched.push('finding:pdf_ua/tagging');
  }

  if (orphans >= 1) matched.push(`taggedContentAudit.orphanMcidCount=${orphans}`);
  if (paths > PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD) {
    matched.push(`taggedContentAudit.suspectedPathPaintOutsideMc=${paths}`);
  }
  if (orphanList > 0) matched.push(`orphanMcids.length=${orphanList}`);
  if (findingMatches(analysis, f => /orphan|path paint|marked-content/i.test(f.message))) {
    matched.push('finding:orphan/path/mc');
  }

  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail:
        'Expected tagged-content proxy: orphan MCIDs, path paint outside MC, or pdf_ua finding (TaggedCont).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function taggedAnnotsSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const aa = snap.annotationAccessibility;
  const n = (aa?.linkAnnotationsMissingStructure ?? 0) + (aa?.nonLinkAnnotationsMissingStructure ?? 0);
  const matched: string[] = [];
  if (n > 0) matched.push(`annotationsMissingStructure=${n}`);
  if (
    findingMatches(
      analysis,
      f =>
        (f.category === 'pdf_ua_compliance' || f.category === 'link_quality') &&
        /annotation|structure tree|OBJR|link/i.test(f.message),
    )
  ) {
    matched.push('finding:annotation/structure');
  }
  const lq = category(analysis, 'link_quality');
  if (lq && lq.applicable && lq.score < 100 && (aa?.linkAnnotationsMissingStructure ?? 0) > 0) {
    matched.push('link_quality<100+linkMissingStructure');
  }
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected annotation/structure counts or link_quality/pdf_ua findings (TaggedAnnots).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function figAltTextSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const informative = snap.figures.filter(f => !f.isArtifact);
  const missing = informative.filter(f => !f.hasAlt || !(f.altText?.trim()));
  const matched: string[] = [];
  const ar = snap.acrobatStyleAltRisks;
  const nestedFig = ar?.nestedFigureAltCount ?? 0;
  const nonFigAlt = ar?.nonFigureWithAltCount ?? 0;
  if (nestedFig > 0) matched.push(`acrobatStyleAltRisks.nestedFigureAltCount=${nestedFig}`);
  if (nonFigAlt > 0) matched.push(`acrobatStyleAltRisks.nonFigureWithAltCount=${nonFigAlt}`);
  if (missing.length > 0) matched.push(`figuresMissingAlt=${missing.length}/${informative.length}`);
  const alt = category(analysis, 'alt_text');
  if (alt?.applicable && alt.score < 100) matched.push(`alt_text.score=${alt.score}`);
  if (findingMatches(analysis, f => f.category === 'alt_text' && /lack alternative|empty.*alt|Figures alternate/i.test(f.message))) {
    matched.push('finding:alt_text/figure');
  }
  matched.push(...imageHeavyAltProxy(snap).map(m => `img:${m}`));
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected missing figure alt or alt_text category/findings (FigAltText).' };
  }
  return { ok: true, matched, detail: '' };
}

function otherAltTextSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const n = snap.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0;
  const matched: string[] = [];
  const nf = snap.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0;
  if (nf > 0) matched.push(`acrobatStyleAltRisks.nonFigureWithAltCount=${nf}`);
  if (n > 0) matched.push(`nonLinkAnnotationsMissingContents=${n}`);
  if (findingMatches(analysis, f => f.category === 'alt_text' && /non-link annotation/i.test(f.message))) {
    matched.push('finding:non-link');
  }
  matched.push(...imageHeavyAltProxy(snap).map(m => `img:${m}`));
  const alt = category(analysis, 'alt_text');
  if (alt?.applicable && alt.score < 100) matched.push(`alt_text.score=${alt.score}`);
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected nonLinkAnnotationsMissingContents or alt_text finding (OtherAltText).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function nestedAltTextSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const nested = snap.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0;
  if (nested > 0) matched.push(`acrobatStyleAltRisks.nestedFigureAltCount=${nested}`);
  if (
    findingMatches(
      analysis,
      f =>
        f.category === 'alt_text' &&
        /nested|empty.*\/Alt|alternate text.*empty|never be read/i.test(f.message),
    )
  ) {
    matched.push('finding:nested/empty-alt');
  }
  const pdfUa = category(analysis, 'pdf_ua_compliance');
  if (pdfUa?.findings.some(f => /nested|alternate text/i.test(f.message))) matched.push('pdf_ua:nested-alt');
  const alt = category(analysis, 'alt_text');
  if (alt?.applicable && alt.score < 100) matched.push(`alt_text.score=${alt.score}`);
  matched.push(...imageHeavyAltProxy(snap).map(m => `img:${m}`));
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected nested/empty alt findings or low alt_text (NestedAltText).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function altTextNoContentSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const orphan = snap.acrobatStyleAltRisks?.orphanedAltEmptyElementCount ?? 0;
  if (orphan > 0) matched.push(`acrobatStyleAltRisks.orphanedAltEmptyElementCount=${orphan}`);
  if (
    findingMatches(
      analysis,
      f => f.category === 'alt_text' && /associated|content|Figure|\/Alt/i.test(f.message),
    )
  ) {
    matched.push('finding:associated-content');
  }
  const alt = category(analysis, 'alt_text');
  if (alt?.applicable && alt.score < 100) matched.push(`alt_text.score=${alt.score}`);
  matched.push(...imageHeavyAltProxy(snap).map(m => `img:${m}`));
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected alt_text findings or score (AltTextNoContent).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function charEncSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const badFonts = snap.fonts.filter(f => !f.hasUnicode).length;
  const matched: string[] = [];
  if (badFonts > 0) matched.push(`fontsWithoutUnicode=${badFonts}`);
  const te = category(analysis, 'text_extractability');
  if (te?.applicable && te.score < 100) matched.push(`text_extractability.score=${te.score}`);
  if (findingMatches(analysis, f => f.category === 'text_extractability' && /unicode|encoding|ToUnicode|font/i.test(f.message))) {
    matched.push('finding:encoding');
  }
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected font unicode signals or text_extractability (CharEnc).' };
  }
  return { ok: true, matched, detail: '' };
}

function bookmarksSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const bm = category(analysis, 'bookmarks');
  const matched: string[] = [];
  if (snap.pageCount >= BOOKMARKS_PAGE_THRESHOLD) {
    if (snap.bookmarks.length === 0) matched.push('longDoc:noOutlines');
    if (bm?.applicable && bm.score < 100) matched.push(`bookmarks.score=${bm.score}`);
    if (bm?.findings.length) matched.push(`bookmarks.findings=${bm.findings.length}`);
  }
  if (findingMatches(analysis, f => f.category === 'bookmarks' && /outline|bookmark/i.test(f.message))) {
    matched.push('finding:bookmarks');
  }
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: `Expected long-document bookmark/outline signal (Bookmarks); pageCount=${snap.pageCount}.`,
    };
  }
  return { ok: true, matched, detail: '' };
}

function tableHeadersSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const tablesNoHeader = snap.tables.filter(t => !t.hasHeaders);
  const matched: string[] = [];
  if (snap.tables.length > 0) matched.push(`tables.count=${snap.tables.length}`);
  if (tablesNoHeader.length > 0) matched.push(`tablesMissingHeaders=${tablesNoHeader.length}`);
  const tm = category(analysis, 'table_markup');
  if (tm?.applicable && tm.score < 100) matched.push(`table_markup.score=${tm.score}`);
  if (findingMatches(analysis, f => f.category === 'table_markup' && /header|table|TH|TD|TR/i.test(f.message))) {
    matched.push('finding:table-headers');
  }
  if (
    findingMatches(
      analysis,
      f => f.category === 'pdf_ua_compliance' && /table|TH|TD|TR|header|row/i.test(f.message),
    )
  ) {
    matched.push('finding:pdf_ua-table');
  }
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected tables without headers or table_markup findings (TableHeaders).' };
  }
  return { ok: true, matched, detail: '' };
}

function tableStructureAdobeSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  if (snap.tables.length > 0) matched.push(`tables.count=${snap.tables.length}`);

  // Richer structural signals from per-table audit
  const misplaced = snap.tables.reduce((s, t) => s + (t.cellsMisplacedCount ?? 0), 0);
  const irregular = snap.tables.reduce((s, t) => s + (t.irregularRows ?? 0), 0);
  const noRows    = snap.tables.filter(t => (t.rowCount ?? 0) === 0 && t.totalCells > 0).length;
  if (misplaced > 0) matched.push(`tables.cellsMisplaced=${misplaced}`);
  if (irregular > 0) matched.push(`tables.irregularRows=${irregular}`);
  if (noRows > 0) matched.push(`tables.noTRChildren=${noRows}`);

  const tm = category(analysis, 'table_markup');
  if (tm?.applicable && tm.score < 100) matched.push(`table_markup.score=${tm.score}`);
  if (
    findingMatches(
      analysis,
      f =>
        f.category === 'table_markup' ||
        (f.category === 'pdf_ua_compliance' && /table|\bTR\b|\bTH\b|\bTD\b|row|column|regular/i.test(f.message)),
    )
  ) {
    matched.push('finding:table-structure');
  }
  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected table_markup or table-related findings (Acrobat table row/cell/regularity rules).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function listAdobeSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const lsa = snap.listStructureAudit;

  // Concrete list structure signals from pikepdf walk
  if (lsa) {
    if (lsa.listCount > 0) matched.push(`listStructureAudit.listCount=${lsa.listCount}`);
    if (lsa.listItemCount > 0) matched.push(`listStructureAudit.listItemCount=${lsa.listItemCount}`);
    if (lsa.listItemMisplacedCount > 0) matched.push(`listStructureAudit.listItemMisplacedCount=${lsa.listItemMisplacedCount}`);
    if (lsa.lblBodyMisplacedCount > 0) matched.push(`listStructureAudit.lblBodyMisplacedCount=${lsa.lblBodyMisplacedCount}`);
    if (lsa.listsWithoutItems > 0) matched.push(`listStructureAudit.listsWithoutItems=${lsa.listsWithoutItems}`);
  }

  // Findings-based fallback (e.g. list-related messages from other scorers)
  if (
    findingMatches(
      analysis,
      f => /\blist\b|\bLI\b|\bLbl\b|\bLBody\b|must be a child of L/i.test(f.message),
    )
  ) {
    matched.push('finding:list');
  }

  // For scanned/OCR PDFs, lists simply don't exist in the tag tree — treat as proxy signal
  if (snap.pdfClass === 'scanned' || snap.pdfClass === 'mixed') {
    matched.push(`pdfClass=${snap.pdfClass}:no_list_tags_expected`);
  }

  if (matched.length === 0) {
    return {
      ok: false,
      matched: [],
      detail: 'Expected listStructureAudit counts, list-related findings, or scanned/mixed pdfClass (List rules).',
    };
  }
  return { ok: true, matched, detail: '' };
}

function headingsNestingSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  const hs = category(analysis, 'heading_structure');
  if (hs?.applicable && hs.score < 100) matched.push(`heading_structure.score=${hs.score}`);
  if (findingMatches(analysis, f => f.category === 'heading_structure' && /nest|heading|H[1-6]/i.test(f.message))) {
    matched.push('finding:headings');
  }
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected heading_structure findings (Headings nesting).' };
  }
  return { ok: true, matched, detail: '' };
}

function hiddenAnnotSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const matched: string[] = [];
  if (findingMatches(analysis, f => f.category === 'alt_text' && /hide|annotation/i.test(f.message))) {
    matched.push('finding:alt/hide-annot');
  }
  const alt = category(analysis, 'alt_text');
  if (alt?.applicable && alt.score < 100) matched.push(`alt_text.score=${alt.score}`);
  matched.push(...imageHeavyAltProxy(snap).map(m => `img:${m}`));
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected alt_text or image-heavy proxy (HiddenAnnot).' };
  }
  return { ok: true, matched, detail: '' };
}

function tabOrderSignal(snap: DocumentSnapshot, analysis: AnalysisResult): AdobePdfafSignalResult {
  const aa = snap.annotationAccessibility;
  const matched: string[] = [];
  if ((aa?.pagesMissingTabsS ?? 0) > 0) matched.push(`pagesMissingTabsS=${aa?.pagesMissingTabsS}`);
  if ((aa?.pagesAnnotationOrderDiffers ?? 0) > 0) {
    matched.push(`pagesAnnotationOrderDiffers=${aa?.pagesAnnotationOrderDiffers}`);
  }
  const ro = category(analysis, 'reading_order');
  if (ro?.applicable && ro.score < 100) matched.push(`reading_order.score=${ro.score}`);
  if (findingMatches(analysis, f => f.category === 'reading_order' && /Tabs|tab order|annotation/i.test(f.message))) {
    matched.push('finding:reading_order/tabs');
  }
  if (matched.length === 0) {
    return { ok: false, matched: [], detail: 'Expected /Tabs/order signals or reading_order findings (TabOrder).' };
  }
  return { ok: true, matched, detail: '' };
}

type Handler = (snap: DocumentSnapshot, analysis: AnalysisResult) => AdobePdfafSignalResult;

const HANDLERS: Record<string, Handler> = {
  TaggedPDF: taggedPdfSignal,
  TaggedCont: taggedContSignal,
  TaggedAnnots: taggedAnnotsSignal,
  DocTitle: docTitleSignal,
  FigAltText: figAltTextSignal,
  OtherAltText: otherAltTextSignal,
  NestedAltText: nestedAltTextSignal,
  AltTextNoContent: altTextNoContentSignal,
  HiddenAnnot: hiddenAnnotSignal,
  CharEnc: charEncSignal,
  Bookmarks: bookmarksSignal,
  TableHeaders: tableHeadersSignal,
  TableRows: tableStructureAdobeSignal,
  THTD: tableStructureAdobeSignal,
  RegularTable: tableStructureAdobeSignal,
  ListItems: listAdobeSignal,
  LblLBody: listAdobeSignal,
  Headings: headingsNestingSignal,
  TabOrder: tabOrderSignal,
};

/**
 * Returns whether PDFAF exposes at least one related signal for an Acrobat **Failed** rule anchor.
 */
export function pdfafSignalCoversAdobeFailure(
  anchor: string,
  snapshot: DocumentSnapshot,
  analysis: AnalysisResult,
  options?: PdfafAdobeSignalOptions,
): AdobePdfafSignalResult {
  if (UNMAPPED_ADOBE_FAILURE_ANCHORS.has(anchor)) {
    return {
      ok: true,
      matched: ['(Acrobat rule not mapped to a PDFAF automatic signal — manual or gap)'],
      detail: '',
      unmapped: true,
    };
  }
  const fn = HANDLERS[anchor];
  if (!fn) {
    return {
      ok: true,
      matched: [`(no handler for anchor "${anchor}" — treat as unmapped)`],
      detail: '',
      unmapped: true,
    };
  }
  const res = fn(snapshot, analysis);
  const floor = options?.lenientWhenScoreAtLeast;
  if (!res.ok && typeof floor === 'number' && analysis.score >= floor) {
    return {
      ok: true,
      matched: [...res.matched, `parity-gap:Adobe Failed "${anchor}" but PDFAF score ${analysis.score}≥${floor}`],
      detail: res.detail,
      parityGap: true,
    };
  }
  return res;
}
