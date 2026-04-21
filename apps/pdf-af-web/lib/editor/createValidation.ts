import type {
  CreateDocument,
  CreateHeadingObject,
  CreateImageObject,
  CreatePage,
  CreatePageObject,
  CreateTableObject,
} from '../../types/createEditor';
import type { EditorIssue } from '../../types/editor';

function issueId(parts: Array<string | number>): string {
  return parts.join(':');
}

function objectTarget(page: CreatePage, object: CreatePageObject) {
  return {
    pageId: page.id,
    objectId: object.id,
    label: `${page.title} · ${object.type}`,
  };
}

function validateImage(page: CreatePage, object: CreateImageObject, pageIndex: number): EditorIssue[] {
  if (object.decorative || object.altText.trim()) return [];

  return [
    {
      id: issueId(['create', 'image_alt', object.id]),
      source: 'authoring-validator',
      category: 'alt_text',
      severity: 'blocker',
      page: pageIndex + 1,
      target: objectTarget(page, object),
      message: 'Image needs alt text or decorative marking.',
      whyItMatters: 'Images need a text alternative unless they are decorative.',
      fixType: 'image_alt_text',
      fixState: 'needs-input',
    },
  ];
}

function validateTable(page: CreatePage, object: CreateTableObject, pageIndex: number): EditorIssue[] {
  if (object.hasHeaderRow) return [];

  return [
    {
      id: issueId(['create', 'table_header', object.id]),
      source: 'authoring-validator',
      category: 'table_markup',
      severity: 'blocker',
      page: pageIndex + 1,
      target: objectTarget(page, object),
      message: 'Table needs a header row.',
      whyItMatters: 'Header cells help assistive technology describe table relationships.',
      fixType: 'table_header_row',
      fixState: 'needs-input',
    },
  ];
}

function validateHeadingSequence(
  page: CreatePage,
  object: CreateHeadingObject,
  pageIndex: number,
  previousLevel: number | null,
): EditorIssue[] {
  if (previousLevel === null || object.level <= previousLevel + 1) return [];

  return [
    {
      id: issueId(['create', 'heading_skip', object.id]),
      source: 'authoring-validator',
      category: 'heading_structure',
      severity: 'warning',
      page: pageIndex + 1,
      target: objectTarget(page, object),
      message: `Heading skips from H${previousLevel} to H${object.level}.`,
      whyItMatters: 'Heading levels should describe the document outline without skipped levels.',
      fixType: 'heading_level',
      fixState: 'needs-input',
    },
  ];
}

export function validateCreateDocument(document: CreateDocument): EditorIssue[] {
  const issues: EditorIssue[] = [];

  if (!document.metadata.title.trim()) {
    issues.push({
      id: 'create:metadata:title',
      source: 'authoring-validator',
      category: 'title_language',
      severity: 'blocker',
      message: 'Document title is required.',
      whyItMatters: 'PDF readers use the title to identify the document.',
      fixType: 'document_title',
      fixState: 'needs-input',
    });
  }

  if (!document.metadata.language.trim()) {
    issues.push({
      id: 'create:metadata:language',
      source: 'authoring-validator',
      category: 'title_language',
      severity: 'blocker',
      message: 'Document language is required.',
      whyItMatters: 'Assistive technology needs the language to pronounce text correctly.',
      fixType: 'document_language',
      fixState: 'needs-input',
    });
  }

  let previousHeadingLevel: number | null = null;

  document.pages.forEach((page, pageIndex) => {
    page.objects.forEach((object) => {
      if (object.type === 'heading') {
        issues.push(...validateHeadingSequence(page, object, pageIndex, previousHeadingLevel));
        previousHeadingLevel = object.level;
      }

      if (object.type === 'image') {
        issues.push(...validateImage(page, object, pageIndex));
      }

      if (object.type === 'table') {
        issues.push(...validateTable(page, object, pageIndex));
      }
    });
  });

  return issues;
}
