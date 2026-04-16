import { runPythonMutationBatch } from '../../../python/bridge.js';

export async function setDocumentTitle(buffer: Buffer, title: string): Promise<Buffer> {
  const t = title.trim();
  if (!t) return buffer;
  const { buffer: out, result } = await runPythonMutationBatch(buffer, [
    { op: 'set_document_title', params: { title: t } },
  ]);
  if (!result.success || result.applied.length === 0) {
    return buffer;
  }
  return out;
}

export async function setDocumentLanguage(buffer: Buffer, language: string): Promise<Buffer> {
  const lang = language.trim();
  if (!lang) return buffer;
  const { buffer: out, result } = await runPythonMutationBatch(buffer, [
    { op: 'set_document_language', params: { language: lang } },
  ]);
  if (!result.success || result.applied.length === 0) {
    return buffer;
  }
  return out;
}

/**
 * PDF/UA identification via pikepdf (single round-trip): /MarkInfo/Marked, /Lang when empty, XMP pdfuaid.
 */
export async function setPdfUaIdentification(buffer: Buffer, language: string): Promise<Buffer> {
  const lang = language.trim() || 'en-US';
  const { buffer: out, result } = await runPythonMutationBatch(buffer, [
    { op: 'set_pdfua_identification', params: { language: lang } },
  ]);
  if (!result.success || result.applied.length === 0) {
    return buffer;
  }
  return out;
}
