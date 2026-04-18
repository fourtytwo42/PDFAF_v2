import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface DesktopDependencyPaths {
  mode: 'development' | 'packaged';
  runtimeRoot: string | null;
  nodeBin: string;
  pythonBin: string;
  qpdfBin: string;
  runtimeManifestPath: string | null;
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

export interface DesktopStartupValidationInput {
  dependencyPaths: DesktopDependencyPaths;
  appPaths: DesktopAppPaths;
}

export interface DesktopRuntimeManifestSummary {
  generatedAt: string;
  platform: string;
  nodeVersion: string | null;
  pythonVersion: string | null;
  qpdfVersion: string | null;
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
      runtimeManifestPath: join(runtimeRoot, 'manifest.json'),
    };
  }

  return {
    mode: 'development',
    runtimeRoot: env['PDFAF_DESKTOP_RUNTIME_ROOT']?.trim() || null,
    nodeBin: env['PDFAF_NODE_BIN']?.trim() || processExecPath,
    pythonBin: env['PDFAF_PYTHON_BIN']?.trim() || 'python',
    qpdfBin: env['PDFAF_QPDF_BIN']?.trim() || 'qpdf',
    runtimeManifestPath: null,
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
  if (!paths.runtimeManifestPath || !existsSync(paths.runtimeManifestPath)) {
    missing.push(`Bundled runtime manifest missing: ${paths.runtimeManifestPath ?? '(not set)'}`);
  }
  return missing;
}

export function validateDesktopStartupInputs(input: DesktopStartupValidationInput): string[] {
  const issues = [...validatePackagedDependencyPaths(input.dependencyPaths)];
  if (!existsSync(input.appPaths.apiEntry)) {
    issues.push(`Bundled API entrypoint missing: ${input.appPaths.apiEntry}`);
  }
  if (!existsSync(input.appPaths.webEntry)) {
    issues.push(`Bundled web entrypoint missing: ${input.appPaths.webEntry}`);
  }
  return issues;
}

export function parseDesktopRuntimeManifest(raw: string): DesktopRuntimeManifestSummary {
  const parsed = JSON.parse(raw) as {
    generatedAt?: string;
    platform?: string;
    versions?: {
      node?: { version?: string };
      python?: { version?: string };
      qpdf?: { version?: string };
    };
  };

  return {
    generatedAt: parsed.generatedAt ?? 'unknown',
    platform: parsed.platform ?? 'unknown',
    nodeVersion: parsed.versions?.node?.version ?? null,
    pythonVersion: parsed.versions?.python?.version ?? null,
    qpdfVersion: parsed.versions?.qpdf?.version ?? null,
  };
}
