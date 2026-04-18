import { describe, expect, it } from 'vitest';
import {
  parseDesktopBuildMetadata,
  parseDesktopRuntimeManifest,
  resolveDesktopAppPaths,
  resolveDesktopDependencyPaths,
  validateDesktopStartupInputs,
  validatePackagedDependencyPaths,
} from '../../apps/desktop/src/runtime.js';

describe('desktop runtime resolver', () => {
  it('uses packaged runtime locations when Electron is packaged', () => {
    const paths = resolveDesktopDependencyPaths({
      desktopDistDir: 'C:\\app\\resources\\app.asar\\apps\\desktop\\dist',
      processExecPath: 'C:\\app\\PDFAF.exe',
      processResourcesPath: 'C:\\app\\resources',
      isPackaged: true,
      env: {},
    });

    expect(paths.mode).toBe('packaged');
    expect(paths.runtimeRoot).toBe('C:\\app\\resources\\runtime');
    expect(paths.webRuntimeRoot).toBe('C:\\app\\resources\\web-runtime');
    expect(paths.nodeBin).toBe('C:\\app\\resources\\runtime\\node\\node.exe');
    expect(paths.pythonBin).toBe('C:\\app\\resources\\runtime\\python\\python.exe');
    expect(paths.qpdfBin).toBe('C:\\app\\resources\\runtime\\qpdf\\bin\\qpdf.exe');
    expect(paths.runtimeManifestPath).toBe('C:\\app\\resources\\runtime\\manifest.json');
    expect(paths.buildMetadataPath).toBe('C:\\app\\resources\\release\\build-metadata.json');
    expect(paths.webRuntimeNodeModulesPath).toBe('C:\\app\\resources\\web-runtime\\node_modules');
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
    expect(paths.webRuntimeRoot).toBe(null);
    expect(paths.nodeBin).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(paths.pythonBin).toBe('python');
    expect(paths.qpdfBin).toBe('qpdf');
    expect(paths.runtimeManifestPath).toBe(null);
    expect(paths.buildMetadataPath).toBe(null);
    expect(paths.webRuntimeNodeModulesPath).toBe(null);
  });

  it('resolves packaged app paths from the asar and asar.unpacked layout', () => {
    const appPaths = resolveDesktopAppPaths({
      desktopDistDir: 'C:\\app\\resources\\app.asar\\apps\\desktop\\dist',
      processResourcesPath: 'C:\\app\\resources',
      isPackaged: true,
    });

    expect(appPaths.repoRoot).toBe('C:\\app\\resources\\app.asar');
    expect(appPaths.unpackedRepoRoot).toBe('C:\\app\\resources\\app.asar.unpacked');
    expect(appPaths.apiEntry).toBe('C:\\app\\resources\\app.asar.unpacked\\dist\\server.js');
    expect(appPaths.webEntry).toBe(
      'C:\\app\\resources\\web-runtime\\apps\\pdf-af-web\\server.js',
    );
    expect(appPaths.preloadPath).toBe('C:\\app\\resources\\app.asar\\apps\\desktop\\dist\\preload.js');
  });

  it('flags missing packaged runtimes and build metadata', () => {
    const errors = validatePackagedDependencyPaths({
      mode: 'packaged',
      runtimeRoot: 'C:\\missing',
      webRuntimeRoot: 'C:\\missing\\web-runtime',
      nodeBin: 'C:\\missing\\node.exe',
      pythonBin: 'C:\\missing\\python.exe',
      qpdfBin: 'C:\\missing\\qpdf.exe',
      runtimeManifestPath: 'C:\\missing\\manifest.json',
      buildMetadataPath: 'C:\\missing\\build-metadata.json',
      webRuntimeNodeModulesPath: 'C:\\missing\\web-runtime\\node_modules',
    });

    expect(errors).toHaveLength(7);
  });

  it('flags missing bundled app entrypoints for installed builds', () => {
    const errors = validateDesktopStartupInputs({
      dependencyPaths: {
        mode: 'packaged',
        runtimeRoot: 'C:\\missing',
        webRuntimeRoot: 'C:\\missing\\web-runtime',
        nodeBin: 'C:\\missing\\node.exe',
        pythonBin: 'C:\\missing\\python.exe',
        qpdfBin: 'C:\\missing\\qpdf.exe',
        runtimeManifestPath: 'C:\\missing\\manifest.json',
        buildMetadataPath: 'C:\\missing\\build-metadata.json',
        webRuntimeNodeModulesPath: 'C:\\missing\\web-runtime\\node_modules',
      },
      appPaths: {
        repoRoot: 'C:\\missing\\app.asar',
        desktopRoot: 'C:\\missing\\app.asar\\apps\\desktop',
        unpackedRepoRoot: 'C:\\missing\\app.asar.unpacked',
        apiEntry: 'C:\\missing\\app.asar.unpacked\\dist\\server.js',
        apiCwd: 'C:\\missing\\app.asar.unpacked',
        webCwd: 'C:\\missing\\web-runtime\\apps\\pdf-af-web',
        webEntry: 'C:\\missing\\web-runtime\\apps\\pdf-af-web\\server.js',
        preloadPath: 'C:\\missing\\app.asar\\apps\\desktop\\dist\\preload.js',
        trayIconPath: 'C:\\missing\\app.asar.unpacked\\apps\\desktop\\assets\\tray.ico',
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

  it('parses build metadata summaries', () => {
    expect(
      parseDesktopBuildMetadata(
        JSON.stringify({
          appVersion: '2.0.0',
          gitCommit: 'abc123',
          buildTimestamp: '2026-04-18T00:00:00.000Z',
          signingConfigured: true,
        }),
      ),
    ).toEqual({
      appVersion: '2.0.0',
      gitCommit: 'abc123',
      buildTimestamp: '2026-04-18T00:00:00.000Z',
      signingConfigured: true,
    });
  });
});
