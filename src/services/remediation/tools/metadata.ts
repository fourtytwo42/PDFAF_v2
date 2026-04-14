import { PDFBool, PDFName } from 'pdf-lib';
import { PDFDocument } from 'pdf-lib';

export async function setDocumentTitle(buffer: Buffer, title: string): Promise<Buffer> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const t = title.trim();
  if (!t) return buffer;
  doc.setTitle(t, { showInWindowTitleBar: true });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function setDocumentLanguage(buffer: Buffer, language: string): Promise<Buffer> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const lang = language.trim();
  if (!lang) return buffer;
  doc.setLanguage(lang);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/**
 * Best-effort PDF/UA markers: /MarkInfo/Marked, /Lang via pdf-lib catalog.
 */
export async function setPdfUaIdentification(buffer: Buffer, language: string): Promise<Buffer> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const lang = language.trim() || 'en-US';
  doc.setLanguage(lang);

  const catalog = doc.catalog;
  const markInfo = doc.context.obj({
    Marked: PDFBool.True,
    Suspects: PDFBool.False,
  });
  catalog.set(PDFName.of('MarkInfo'), markInfo);

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
