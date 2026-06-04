import { expect, test } from 'vitest';
import { resolveWorkerDbPath } from '../../scripts/progressive-remediation-cycle.js';

test('batch db paths separate public accumulation from protected isolation', () => {
  const workRoot = '/tmp/pdfaf-batch';
  const publicPath = resolveWorkerDbPath('public', workRoot, 7);
  const protectedPath = resolveWorkerDbPath('protected', workRoot, 7);

  expect(publicPath).toBe('/tmp/pdfaf-batch/batch-007/learning.db');
  expect(protectedPath).toBe(':memory:');
  expect(publicPath).not.toBe(protectedPath);
});
