import type { EditFixInstruction } from '../../types/editEditor';
import type { EditorIssue } from '../../types/editor';

export type EditIssueFixPromptMode = 'metadata' | 'alt-text' | 'info';

export function normalizeEditIssueCategory(category: string): string {
  return category.toLowerCase().trim().replaceAll(/[\s/-]+/g, '_');
}

export function isMetadataIssueCategory(category: string): boolean {
  const normalizedCategory = normalizeEditIssueCategory(category);
  return (
    normalizedCategory === 'title_language' ||
    normalizedCategory === 'title_and_language' ||
    normalizedCategory === 'document_metadata' ||
    normalizedCategory === 'metadata'
  );
}

export function isAltTextIssueCategory(category: string): boolean {
  return normalizeEditIssueCategory(category) === 'alt_text';
}

function issueDetailText(issue: EditorIssue): string {
  return `${issue.message} ${issue.whyItMatters ?? ''}`.toLowerCase();
}

export function issueNeedsDocumentTitle(issue: EditorIssue): boolean {
  return /\btitle\b|\/title/.test(issueDetailText(issue));
}

export function issueNeedsDocumentLanguage(issue: EditorIssue): boolean {
  return /\blanguage\b|\blang\b|\/lang/.test(issueDetailText(issue));
}

export function issueNeedsPdfUaIdentification(issue: EditorIssue): boolean {
  return /pdfuaid|pdf_ua|pdf-ua|pdf\/ua conformance|pdf\/ua identification|pdf\/ua metadata/.test(
    issueDetailText(issue),
  );
}

export function isMetadataRepairIssue(issue: EditorIssue): boolean {
  if (isAltTextIssueCategory(issue.category)) return false;
  if (isMetadataIssueCategory(issue.category)) return true;

  if (normalizeEditIssueCategory(issue.category) !== 'pdf_ua_compliance') return false;

  return (
    issueNeedsDocumentTitle(issue) ||
    issueNeedsDocumentLanguage(issue) ||
    issueNeedsPdfUaIdentification(issue)
  );
}

export function getEditIssueFixPromptMode(issue: EditorIssue): EditIssueFixPromptMode {
  if (isMetadataRepairIssue(issue)) return 'metadata';
  if (isAltTextIssueCategory(issue.category) && issue.target?.objectRef) return 'alt-text';
  return 'info';
}

export function validateEditFix(fix: EditFixInstruction): string | null {
  if (fix.type === 'set_document_title' && fix.title.trim().length === 0) {
    return 'Document title is required.';
  }

  if (fix.type === 'set_document_language' && fix.language.trim().length === 0) {
    return 'Document language is required.';
  }

  if (fix.type === 'set_pdfua_identification' && fix.language.trim().length === 0) {
    return 'PDF/UA identification needs a document language.';
  }

  if (fix.type === 'set_figure_alt_text') {
    if (fix.objectRef.trim().length === 0) return 'Alt text needs target evidence.';
    if (fix.altText.trim().length === 0) return 'Alt text is required.';
  }

  if (fix.type === 'mark_figure_decorative' && fix.objectRef.trim().length === 0) {
    return 'Decorative image marking needs target evidence.';
  }

  return null;
}

export function validateEditFixes(fixes: EditFixInstruction[]): string | null {
  if (fixes.length === 0) return 'Add at least one fix before applying.';
  return fixes.map(validateEditFix).find(Boolean) ?? null;
}

export function upsertEditFix(
  fixes: EditFixInstruction[],
  nextFix: EditFixInstruction,
): EditFixInstruction[] {
  const key = editFixKey(nextFix);
  return [...fixes.filter((fix) => editFixKey(fix) !== key), nextFix];
}

export function removeEditFix(
  fixes: EditFixInstruction[],
  type: EditFixInstruction['type'],
  objectRef?: string,
): EditFixInstruction[] {
  return fixes.filter((fix) => {
    if (fix.type !== type) return true;
    if (!objectRef) return false;
    return !('objectRef' in fix) || fix.objectRef !== objectRef;
  });
}

export function editFixKey(fix: EditFixInstruction): string {
  if (fix.type === 'set_figure_alt_text' || fix.type === 'mark_figure_decorative') {
    return `${fix.type}:${fix.objectRef}`;
  }

  return fix.type;
}

function metadataFixesCoverIssue(
  issue: EditorIssue,
  hasTitleFix: boolean,
  hasLanguageFix: boolean,
  hasPdfUaFix: boolean,
): boolean {
  const categoryText = issue.category.toLowerCase();
  const needsTitle = issueNeedsDocumentTitle(issue);
  const needsLanguage = issueNeedsDocumentLanguage(issue);
  const needsPdfUa = issueNeedsPdfUaIdentification(issue);

  if (needsPdfUa) return hasPdfUaFix;

  if (needsTitle && needsLanguage) return hasTitleFix && hasLanguageFix;
  if (needsTitle) return hasTitleFix;
  if (needsLanguage) return hasLanguageFix;

  return categoryText.includes('title') || categoryText.includes('language')
    ? hasTitleFix || hasLanguageFix
    : false;
}

export function applyPendingFixStateToIssues(
  issues: EditorIssue[],
  fixes: EditFixInstruction[],
): EditorIssue[] {
  if (fixes.length === 0) return issues;

  const hasTitleFix = fixes.some((fix) => fix.type === 'set_document_title');
  const hasPdfUaFix = fixes.some((fix) => fix.type === 'set_pdfua_identification');
  const hasLanguageFix = fixes.some((fix) => fix.type === 'set_document_language') || hasPdfUaFix;
  const figureRefs = new Set(
    fixes
      .filter((fix): fix is Extract<EditFixInstruction, { objectRef: string }> => 'objectRef' in fix)
      .map((fix) => fix.objectRef),
  );

  return issues.map((issue) => {
    const metadataReady =
      isMetadataRepairIssue(issue) &&
      metadataFixesCoverIssue(issue, hasTitleFix, hasLanguageFix, hasPdfUaFix);
    const figureReady =
      isAltTextIssueCategory(issue.category) && Boolean(issue.target?.objectRef && figureRefs.has(issue.target.objectRef));

    return metadataReady || figureReady
      ? {
          ...issue,
          fixState: 'ready',
        }
      : issue;
  });
}
