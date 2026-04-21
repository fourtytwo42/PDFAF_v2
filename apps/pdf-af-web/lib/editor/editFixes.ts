import type { EditFixInstruction } from '../../types/editEditor';
import type { EditorIssue } from '../../types/editor';

export function validateEditFix(fix: EditFixInstruction): string | null {
  if (fix.type === 'set_document_title' && fix.title.trim().length === 0) {
    return 'Document title is required.';
  }

  if (fix.type === 'set_document_language' && fix.language.trim().length === 0) {
    return 'Document language is required.';
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

export function applyPendingFixStateToIssues(
  issues: EditorIssue[],
  fixes: EditFixInstruction[],
): EditorIssue[] {
  if (fixes.length === 0) return issues;

  const hasTitleFix = fixes.some((fix) => fix.type === 'set_document_title');
  const hasLanguageFix = fixes.some((fix) => fix.type === 'set_document_language');
  const figureRefs = new Set(
    fixes
      .filter((fix): fix is Extract<EditFixInstruction, { objectRef: string }> => 'objectRef' in fix)
      .map((fix) => fix.objectRef),
  );

  return issues.map((issue) => {
    const normalizedCategory = issue.category.toLowerCase().replaceAll(' ', '_');
    const metadataReady =
      normalizedCategory === 'title_and_language' && (hasTitleFix || hasLanguageFix);
    const figureReady =
      normalizedCategory === 'alt_text' &&
      Boolean(issue.target?.objectRef && figureRefs.has(issue.target.objectRef));

    return metadataReady || figureReady
      ? {
          ...issue,
          fixState: 'ready',
        }
      : issue;
  });
}
