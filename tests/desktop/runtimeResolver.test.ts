import { describe, expect, it } from 'vitest';
import {
  resolveDesktopAppPaths,
  resolveDesktopDependencyPaths,
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

    expect(errors).toHaveLength(3);
  });
});
