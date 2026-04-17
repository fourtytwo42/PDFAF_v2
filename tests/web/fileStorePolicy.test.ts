import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('fileStore storage policy helpers', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...previousEnv };
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('defaults to web-ephemeral policy', async () => {
    delete process.env['PDF_AF_STORAGE_POLICY'];

    const fileStore = await import('../../apps/pdf-af-web/lib/server/fileStore');

    expect(fileStore.configuredStoragePolicy()).toBe('web-ephemeral');
    expect(fileStore.isDesktopPersistentStorage()).toBe(false);
    expect(fileStore.computedExpiresAt()).toBeTruthy();
  });

  it('uses desktop-persistent policy when configured', async () => {
    process.env['PDF_AF_STORAGE_POLICY'] = 'desktop-persistent';

    const fileStore = await import('../../apps/pdf-af-web/lib/server/fileStore');

    expect(fileStore.configuredStoragePolicy()).toBe('desktop-persistent');
    expect(fileStore.isDesktopPersistentStorage()).toBe(true);
    expect(fileStore.computedExpiresAt()).toBeNull();
  });
});
