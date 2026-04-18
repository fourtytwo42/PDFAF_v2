import { describe, expect, it } from 'vitest';
import {
  parseDesktopRuntimeManifest,
  resolveDesktopAppPaths,
  resolveDesktopDependencyPaths,
  validateDesktopStartupInputs,
  validatePackagedDependencyPaths,
} from '../../apps/desktop/src/runtime.js';

describe('desktop runtime resolver', () => {
  it('uses packaged runtime locations when Electron is packaged', () => {
    const paths = resolveDesktopDependencyPaths({
      desktopDistDir: 'C:\\app\\resources\\app\\apps\\desktop\\dist',
      processExecPath: 'C:\\app\\PDFAF.exe',
      processResourcesPath: 'C:\\app\\resources',
      isPackaged: true,
      env: {},
    });

    expect(paths.mode).toBe('packaged');
    expect(paths.runtimeRoot).toBe('C:\\app\\resources\\runtime');
    expect(paths.nodeBin).toBe('C:\\app\\resources\\runtime\\node\\node.exe');
    expect(paths.pythonBin).toBe('C:\\app\\resources\\runtime\\python\\python.exe');
    expect(paths.qpdfBin).toBe('C:\\app\\resources\\runtime\\qpdf\\bin\\qpdf.exe');
    expect(paths.runtimeManifestPath).toBe('C:\\app\\resources\\runtime\\manifest.json');
  });

  it('uses dev runtime defaults when Electron is not packaged', () => {
    const paths = resolveDesktopDependencyPaths({
      desktopDistDir: 'C:\\repo\\apps\\desktop\\dist',
      processExecPath: 'C:\\Program Files\\nodejs\\node.exe',
      processResourcesPath: 'C:\\ignored',
      isPackaged: false,
      env: {},
    });

    expect(paths.mode).toBe('development');
    expect(paths.runtimeRoot).toBe(null);
    expect(paths.nodeBin).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(paths.pythonBin).toBe('python');
    expect(paths.qpdfBin).toBe('qpdf');
    expect(paths.runtimeManifestPath).toBe(null);
  });

  it('resolves packaged repo-relative app paths from the desktop dist directory', () => {
    const appPaths = resolveDesktopAppPaths('C:\\app\\resources\\app\\apps\\desktop\\dist');

    expect(appPaths.repoRoot).toBe('C:\\app\\resources\\app');
    expect(appPaths.apiEntry).toBe('C:\\app\\resources\\app\\dist\\server.js');
    expect(appPaths.webEntry).toBe(
      'C:\\app\\resources\\app\\apps\\pdf-af-web\\.next\\standalone\\apps\\pdf-af-web\\server.js',
    );
  });

  it('flags missing packaged runtimes', () => {
    const errors = validatePackagedDependencyPaths({
      mode: 'packaged',
      runtimeRoot: 'C:\\missing',
      nodeBin: 'C:\\missing\\node.exe',
      pythonBin: 'C:\\missing\\python.exe',
      qpdfBin: 'C:\\missing\\qpdf.exe',
    });

    expect(errors).toHaveLength(4);
  });

  it('flags missing bundled app entrypoints for installed builds', () => {
    const errors = validateDesktopStartupInputs({
      dependencyPaths: {
        mode: 'packaged',
        runtimeRoot: 'C:\\missing',
        nodeBin: 'C:\\missing\\node.exe',
        pythonBin: 'C:\\missing\\python.exe',
        qpdfBin: 'C:\\missing\\qpdf.exe',
        runtimeManifestPath: 'C:\\missing\\manifest.json',
      },
      appPaths: {
        repoRoot: 'C:\\missing',
        desktopRoot: 'C:\\missing\\apps\\desktop',
        apiEntry: 'C:\\missing\\dist\\server.js',
        apiCwd: 'C:\\missing',
        webCwd: 'C:\\missing\\apps\\pdf-af-web',
        webEntry: 'C:\\missing\\apps\\pdf-af-web\\.next\\standalone\\server.js',
        preloadPath: 'C:\\missing\\apps\\desktop\\dist\\preload.js',
        trayIconPath: 'C:\\missing\\apps\\desktop\\assets\\tray.ico',
      },
    });

    expect(errors.some((error) => error.includes('Bundled API entrypoint missing'))).toBe(true);
    expect(errors.some((error) => error.includes('Bundled web entrypoint missing'))).toBe(true);
  });

  it('parses desktop runtime manifest summaries', () => {
    const summary = parseDesktopRuntimeManifest(
      JSON.stringify({
        generatedAt: '2026-04-18T00:00:00.000Z',
        platform: 'win32-x64',
        versions: {
          node: { version: '22.15.0' },
          python: { version: '3.11.9' },
          qpdf: { version: '12.3.2' },
        },
      }),
    );

    expect(summary).toEqual({
      generatedAt: '2026-04-18T00:00:00.000Z',
      platform: 'win32-x64',
      nodeVersion: '22.15.0',
      pythonVersion: '3.11.9',
      qpdfVersion: '12.3.2',
    });
  });
});
