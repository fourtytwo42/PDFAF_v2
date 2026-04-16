import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PY = process.env['PYTHON'] ?? 'python3';
const here = dirname(fileURLToPath(import.meta.url));
const helper = join(here, '../../python/pdf_analysis_helper.py');

function pyExtractResolved(rawB64: string): string {
  const script = `
import base64, importlib.util, re, sys
raw = base64.b64decode(${JSON.stringify(rawB64)})
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(helper)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
mat = next(m.MCID_OP_RE.finditer(raw))
print(m.extract_resolved_text_after_mcid(raw, mat), end="")
`;
  return execFileSync(PY, ['-c', script], { encoding: 'utf-8' });
}

describe('extract_resolved_text_after_mcid (Python)', () => {
  it('reads literal (Hello) Tj after /MCID', () => {
    const raw = Buffer.from(
      '/P << /MCID 0 >> BDC BT /F1 12 Tf 10 10 Td (Hello) Tj ET EMC',
      'utf-8',
    );
    expect(pyExtractResolved(raw.toString('base64'))).toBe('Hello');
  });

  it('reads hex <48656C6C6F> Tj after /MCID (ASCII “Hello”)', () => {
    const raw = Buffer.from(
      '/P << /MCID 1 >> BDC BT /F1 12 Tf 10 10 Td <48656C6C6F> Tj ET EMC',
      'utf-8',
    );
    expect(pyExtractResolved(raw.toString('base64'))).toBe('Hello');
  });

  it('reads TJ array [(Hel)(lo)] TJ after /MCID', () => {
    const raw = Buffer.from(
      '/P << /MCID 2 >> BDC BT /F1 12 Tf 10 10 Td [(Hel)(lo)] TJ ET EMC',
      'utf-8',
    );
    expect(pyExtractResolved(raw.toString('base64'))).toBe('Hello');
  });
});
