import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Adobe aggregate thresholds fixture', () => {
  it('parses and has numeric caps for known anchors', async () => {
    const p = join(process.cwd(), 'tests', 'fixtures', 'adobe_anchor_thresholds.json');
    const j = JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>;
    expect(typeof j['TaggedCont']).toBe('number');
    expect((j['TaggedCont'] as number) > 0).toBe(true);
  });
});
