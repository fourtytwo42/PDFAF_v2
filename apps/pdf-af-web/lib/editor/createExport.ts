import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type {
  CreateDocument,
  CreatePageObject,
  CreateTableObject,
} from '../../types/createEditor';
import type { NormalizedFinding } from '../../types/analyze';
import type { EditorIssue, EditorIssueSeverity } from '../../types/editor';

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = LETTER_WIDTH - MARGIN * 2;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

export interface CreatePdfExportResult {
  blob: Blob;
  fileName: string;
}

function sanitizeFileName(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

  return `${normalized || 'untitled-accessible-draft'}.pdf`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: {
    font: PDFFont;
    size: number;
    maxChars: number;
    color?: ReturnType<typeof rgb>;
  },
): number {
  let nextY = y;
  wrapText(text, options.maxChars).forEach((line) => {
    page.drawText(line, {
      x,
      y: nextY,
      size: options.size,
      font: options.font,
      color: options.color ?? rgb(0.08, 0.13, 0.2),
    });
    nextY -= Math.max(options.size + 5, LINE_HEIGHT);
  });
  return nextY;
}

function ensureSpace(pdfDoc: PDFDocument, page: PDFPage, y: number, needed: number): { page: PDFPage; y: number } {
  if (y - needed >= MARGIN) {
    return { page, y };
  }

  return {
    page: pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]),
    y: LETTER_HEIGHT - MARGIN,
  };
}

function drawTable(page: PDFPage, table: CreateTableObject, x: number, y: number, font: PDFFont, boldFont: PDFFont): number {
  let nextY = drawWrappedText(page, table.caption || 'Table', x, y, {
    font: boldFont,
    size: 12,
    maxChars: 70,
  });
  nextY -= 6;

  const columnCount = Math.max(...table.rows.map((row) => row.cells.length), 1);
  const cellWidth = CONTENT_WIDTH / columnCount;
  const cellHeight = 22;

  table.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, cellIndex) => {
      const cellX = x + cellIndex * cellWidth;
      const cellY = nextY - cellHeight;
      const header = table.hasHeaderRow && rowIndex === 0;

      page.drawRectangle({
        x: cellX,
        y: cellY,
        width: cellWidth,
        height: cellHeight,
        borderColor: rgb(0.72, 0.76, 0.82),
        borderWidth: 0.75,
        color: header ? rgb(0.9, 0.94, 1) : rgb(1, 1, 1),
      });
      page.drawText(cell.text.slice(0, 36), {
        x: cellX + 5,
        y: cellY + 7,
        size: 9,
        font: header ? boldFont : font,
        color: rgb(0.08, 0.13, 0.2),
      });
    });
    nextY -= cellHeight;
  });

  return nextY - 12;
}

function drawObject(
  pdfDoc: PDFDocument,
  page: PDFPage,
  object: CreatePageObject,
  y: number,
  font: PDFFont,
  boldFont: PDFFont,
): { page: PDFPage; y: number } {
  if (object.type === 'heading') {
    const sizeByLevel: Record<number, number> = {
      1: 22,
      2: 17,
      3: 14,
      4: 12,
      5: 11,
      6: 10,
    };
    const size = sizeByLevel[object.level] ?? 12;
    const spaced = ensureSpace(pdfDoc, page, y, size + 16);
    return {
      page: spaced.page,
      y:
        drawWrappedText(spaced.page, object.text || `Heading ${object.level}`, MARGIN, spaced.y, {
          font: boldFont,
          size,
          maxChars: 58,
        }) - 6,
    };
  }

  if (object.type === 'paragraph') {
    const spaced = ensureSpace(pdfDoc, page, y, 48);
    return {
      page: spaced.page,
      y:
        drawWrappedText(spaced.page, object.text || 'Paragraph', MARGIN, spaced.y, {
          font,
          size: BODY_SIZE,
          maxChars: 88,
        }) - 8,
    };
  }

  if (object.type === 'image') {
    const spaced = ensureSpace(pdfDoc, page, y, 132);
    spaced.page.drawRectangle({
      x: MARGIN,
      y: spaced.y - 94,
      width: CONTENT_WIDTH,
      height: 86,
      borderColor: rgb(0.56, 0.64, 0.74),
      borderWidth: 1,
      color: rgb(0.96, 0.98, 1),
    });
    spaced.page.drawText(object.label || 'Image placeholder', {
      x: MARGIN + 12,
      y: spaced.y - 42,
      size: 12,
      font: boldFont,
      color: rgb(0.31, 0.39, 0.5),
    });
    const note = object.decorative
      ? 'Decorative image'
      : `Alt text: ${object.altText || 'missing'}`;
    return {
      page: spaced.page,
      y:
        drawWrappedText(spaced.page, note, MARGIN + 12, spaced.y - 68, {
          font,
          size: 10,
          maxChars: 82,
          color: rgb(0.31, 0.39, 0.5),
        }) - 18,
    };
  }

  const tableHeight = 42 + object.rows.length * 22;
  const spaced = ensureSpace(pdfDoc, page, y, tableHeight);
  return {
    page: spaced.page,
    y: drawTable(spaced.page, object, MARGIN, spaced.y, font, boldFont),
  };
}

function setCatalogLanguageAndMarked(pdfDoc: PDFDocument, language: string) {
  pdfDoc.catalog.set(PDFName.of('Lang'), PDFString.of(language));
  const markInfo = PDFDict.withContext(pdfDoc.context);
  markInfo.set(PDFName.of('Marked'), PDFBool.True);
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), markInfo);
}

export async function exportCreateDocumentToPdf(document: CreateDocument): Promise<CreatePdfExportResult> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(document.metadata.title.trim() || 'Untitled accessible draft');
  pdfDoc.setSubject('PDF Auto Fixer create-mode export spike');
  pdfDoc.setCreator('PDF Auto Fixer');
  pdfDoc.setProducer('PDF Auto Fixer');
  setCatalogLanguageAndMarked(pdfDoc, document.metadata.language.trim() || 'en-US');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  document.pages.forEach((createPage, index) => {
    let page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    let y = LETTER_HEIGHT - MARGIN;

    page.drawText(createPage.title || `Page ${index + 1}`, {
      x: MARGIN,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.39, 0.46, 0.55),
    });
    y -= 28;

    createPage.objects.forEach((object) => {
      const next = drawObject(pdfDoc, page, object, y, font, boldFont);
      page = next.page;
      y = next.y;
    });
  });

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  return {
    blob: new Blob([arrayBuffer], { type: 'application/pdf' }),
    fileName: sanitizeFileName(document.metadata.title),
  };
}

function mapFindingSeverity(severity: NormalizedFinding['severity']): EditorIssueSeverity {
  if (severity === 'critical' || severity === 'moderate') return 'blocker';
  if (severity === 'minor') return 'warning';
  return 'info';
}

export function mapAnalyzeFindingsToEditorIssues(findings: NormalizedFinding[]): EditorIssue[] {
  return findings.map((finding, index) => ({
    id: `export:${finding.id || index}`,
    source: 'export-check',
    category: finding.category,
    severity: mapFindingSeverity(finding.severity),
    page: finding.page,
    message: finding.title || finding.summary,
    whyItMatters: finding.summary,
    fixType: `export_${finding.category}`,
    fixState: 'needs-input',
    standardsLinks: finding.references,
  }));
}
