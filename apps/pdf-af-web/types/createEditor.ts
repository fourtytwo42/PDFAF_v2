export type CreateObjectType = 'heading' | 'paragraph' | 'image' | 'table';

export interface CreateDocumentMetadata {
  title: string;
  language: string;
}

export interface CreateBaseObject {
  id: string;
  type: CreateObjectType;
}

export interface CreateHeadingObject extends CreateBaseObject {
  type: 'heading';
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface CreateParagraphObject extends CreateBaseObject {
  type: 'paragraph';
  text: string;
}

export interface CreateImageObject extends CreateBaseObject {
  type: 'image';
  label: string;
  altText: string;
  decorative: boolean;
}

export interface CreateTableCell {
  id: string;
  text: string;
}

export interface CreateTableRow {
  id: string;
  cells: CreateTableCell[];
}

export interface CreateTableObject extends CreateBaseObject {
  type: 'table';
  caption: string;
  hasHeaderRow: boolean;
  rows: CreateTableRow[];
}

export type CreatePageObject =
  | CreateHeadingObject
  | CreateParagraphObject
  | CreateImageObject
  | CreateTableObject;

export interface CreatePage {
  id: string;
  title: string;
  objects: CreatePageObject[];
}

export interface CreateDocument {
  id: string;
  metadata: CreateDocumentMetadata;
  pages: CreatePage[];
}

export interface CreateEditorSelection {
  pageId: string | null;
  objectId: string | null;
}
