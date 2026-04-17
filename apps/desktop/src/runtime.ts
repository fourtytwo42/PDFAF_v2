import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface DesktopDependencyPaths {
  mode: 'development' | 'packaged';
  runtimeRoot: string | null;
  nodeBin: string;
  pythonBin: string;
  qpdfBin: string;
}

export interface DesktopAppPaths {
  repoRoot: string;
  desktopRoot: string;
  apiEntry: string;
  apiCwd: string;
  webCwd: string;
  webEntry: string;
  preloadPath: string;
  trayIconPath: string;
}

interface ResolveDesktopPathsArgs {
  desktopDistDir: string;
  processExecPath?: string;
  processResourcesPath?: string;
  isPackaged?: boolean;
  env?: NodeJS.ProcessEnv;
}

export function resolveDesktopDependencyPaths(args: ResolveDesktopPathsArgs): DesktopDependencyPaths {
  const env = args.env ?? process.env;
  const processExecPath = args.processExecPath ?? process.execPath;
  const processResourcesPath = args.processResourcesPath ?? process.resourcesPath;
  const isPackaged = args.isPackaged ?? false;

  if (isPackaged) {
    const runtimeRoot = join(processResourcesPath, 'runtime');
    return {
      mode: 'packaged',
      runtimeRoot,
      nodeBin: env['PDFAF_NODE_BIN']?.trim() || join(runtimeRoot, 'node', 'node.exe'),
      pythonBin: env['PDFAF_PYTHON_BIN']?.trim() || join(runtimeRoot, 'python', 'python.exe'),
      qpdfBin: env['PDFAF_QPDF_BIN']?.trim() || join(runtimeRoot, 'qpdf', 'bin', 'qpdf.exe'),
    };
  }

  return {
    mode: 'development',
    runtimeRoot: env['PDFAF_DESKTOP_RUNTIME_ROOT']?.trim() || null,
    nodeBin: env['PDFAF_NODE_BIN']?.trim() || processExecPath,
    pythonBin: env['PDFAF_PYTHON_BIN']?.trim() || 'python',
    qpdfBin: env['PDFAF_QPDF_BIN']?.trim() || 'qpdf',
  };
}

export function resolveDesktopAppPaths(desktopDistDir: string): DesktopAppPaths {
  const desktopRoot = resolve(desktopDistDir, '..');
  const repoRoot = resolve(desktopRoot, '..', '..');
  const webCwd = join(repoRoot, 'apps', 'pdf-af-web');

  return {
    repoRoot,
    desktopRoot,
    apiEntry: join(repoRoot, 'dist', 'server.js'),
    apiCwd: repoRoot,
    webCwd,
    webEntry: join(webCwd, '.next', 'standalone', 'apps', 'pdf-af-web', 'server.js'),
    preloadPath: join(desktopRoot, 'dist', 'preload.js'),
    trayIconPath: join(desktopRoot, 'assets', 'tray.ico'),
  };
}

export function validatePackagedDependencyPaths(paths: DesktopDependencyPaths): string[] {
  if (paths.mode !== 'packaged') return [];

  const missing: string[] = [];
  if (!existsSync(paths.nodeBin)) missing.push(`Bundled Node runtime missing: ${paths.nodeBin}`);
  if (!existsSync(paths.pythonBin)) missing.push(`Bundled Python runtime missing: ${paths.pythonBin}`);
  if (!existsSync(paths.qpdfBin)) missing.push(`Bundled qpdf runtime missing: ${paths.qpdfBin}`);
  return missing;
}
