import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { DocumentSnapshot } from '../../types.js';

const execFileAsync = promisify(execFile);

/**
 * When to run Ghostscript font embedding:
 * - `PDFAF_EMBED_FONTS=1` — always attempt (full pass; can strip structure on some PDFs — use with care).
 * - `PDFAF_AUTO_EMBED_ENCODING=1` — only when *snapshot* reports at least one `fonts[].encodingRisk`
 *   (Acrobat "Character encoding" / non-embedded / missing ToUnicode heuristics from Python).
 *
 * Default is off: `pdfwrite` embedding is not reliably structure-preserving on all tagged exports.
 */
export function shouldRunGhostscriptFontEmbed(snapshot: DocumentSnapshot | null | undefined): boolean {
  const force = process.env['PDFAF_EMBED_FONTS']?.trim() === '1';
  if (force) return true;
  if (!snapshot || snapshot.pdfClass === 'scanned') return false;
  const auto = process.env['PDFAF_AUTO_EMBED_ENCODING']?.trim() === '1';
  if (!auto) return false;
  return snapshot.fonts.some(f => Boolean(f.encodingRisk));
}

const _centuryOrImpressumRe = /\b(century|impressum)\b/i;

/**
 * When to run the Python `embed_urw_type1_substitutes` pass (URW base35 Type1 files on disk):
 * non-scanned PDFs whose snapshot lists non-embedded Type1 Century* / Impressum* (Acrobat "Character encoding").
 * Set `PDFAF_URW_TYPE1_EMBED=0` to skip. Default on.
 */
export function shouldTryUrwType1Embed(snapshot: DocumentSnapshot | null | undefined): boolean {
  if (process.env['PDFAF_URW_TYPE1_EMBED']?.trim() === '0') return false;
  if (!snapshot || snapshot.pdfClass === 'scanned') return false;
  return snapshot.fonts.some(
    f =>
      !f.isEmbedded &&
      String(f.subtype ?? '').toLowerCase() === 'type1' &&
      _centuryOrImpressumRe.test(f.name ?? ''),
  );
}

/**
 * Structure-preserving local font substitution pass. Unlike Ghostscript, this does not rewrite
 * the whole PDF; it only embeds installed open-font substitutes for analyzer-visible encoding risk.
 * Set `PDFAF_LOCAL_FONT_SUBSTITUTION=0` to skip. Default on.
 */
export function shouldTryLocalFontSubstitution(snapshot: DocumentSnapshot | null | undefined): boolean {
  if (process.env['PDFAF_LOCAL_FONT_SUBSTITUTION']?.trim() === '0') return false;
  if (!snapshot || snapshot.pdfClass === 'scanned') return false;
  if ((snapshot.textCharCount ?? 0) <= 0) return false;
  return snapshot.fonts.some(font =>
    Boolean(font.encodingRisk) &&
    (!font.isEmbedded || !font.hasUnicode)
  );
}

/**
 * Ghostscript rewrite to embed/subset fonts. Returns null if disabled by env / snapshot rules,
 * if `gs` fails, or on empty output. Install `gs` on PATH or set `PDFAF_GS_BIN`.
 */
export async function embedFontsWithGhostscript(
  buffer: Buffer,
  snapshot?: DocumentSnapshot | null,
): Promise<Buffer | null> {
  if (!shouldRunGhostscriptFontEmbed(snapshot ?? null)) return null;
  const gs = (process.env['PDFAF_GS_BIN'] ?? 'gs').trim() || 'gs';
  const id = randomUUID();
  const inPath = join(tmpdir(), `pdfaf-gs-in-${id}.pdf`);
  const outPath = join(tmpdir(), `pdfaf-gs-out-${id}.pdf`);
  try {
    await writeFile(inPath, buffer);
    await execFileAsync(
      gs,
      [
        '-o',
        outPath,
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dPDFSETTINGS=/prepress',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        '-dCompressFonts=true',
        '-dCompatibilityLevel=1.7',
        inPath,
      ],
      { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const out = await readFile(outPath);
    if (out.length < 100) return null;
    return out;
  } catch {
    return null;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
