import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface DesktopDependencyPaths {
  mode: 'development' | 'packaged';
  runtimeRoot: string | null;
  webRuntimeRoot: string | null;
  nodeBin: string;
  pythonBin: string;
  qpdfBin: string;
  runtimeManifestPath: string | null;
  buildMetadataPath: string | null;
  webRuntimeNodeModulesPath: string | null;
}

export interface DesktopAppPaths {
  repoRoot: string;
  desktopRoot: string;
  unpackedRepoRoot: string | null;
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

export interface DesktopBuildMetadataSummary {
  appVersion: string;
  gitCommit: string | null;
  buildTimestamp: string;
  signingConfigured: boolean;
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
    const webRuntimeRoot = join(processResourcesPath, 'web-runtime');
    return {
      mode: 'packaged',
      runtimeRoot,
      webRuntimeRoot,
      nodeBin: env['PDFAF_NODE_BIN']?.trim() || join(runtimeRoot, 'node', 'node.exe'),
      pythonBin: env['PDFAF_PYTHON_BIN']?.trim() || join(runtimeRoot, 'python', 'python.exe'),
      qpdfBin: env['PDFAF_QPDF_BIN']?.trim() || join(runtimeRoot, 'qpdf', 'bin', 'qpdf.exe'),
      runtimeManifestPath: join(runtimeRoot, 'manifest.json'),
      buildMetadataPath: join(processResourcesPath, 'release', 'build-metadata.json'),
      webRuntimeNodeModulesPath: join(webRuntimeRoot, 'node_modules'),
    };
  }

  return {
    mode: 'development',
    runtimeRoot: env['PDFAF_DESKTOP_RUNTIME_ROOT']?.trim() || null,
    webRuntimeRoot: null,
    nodeBin: env['PDFAF_NODE_BIN']?.trim() || processExecPath,
    pythonBin: env['PDFAF_PYTHON_BIN']?.trim() || 'python',
    qpdfBin: env['PDFAF_QPDF_BIN']?.trim() || 'qpdf',
    runtimeManifestPath: null,
    buildMetadataPath: null,
    webRuntimeNodeModulesPath: null,
  };
}

export function resolveDesktopAppPaths(args: ResolveDesktopPathsArgs): DesktopAppPaths {
  const desktopRoot = resolve(args.desktopDistDir, '..');
  const processResourcesPath = args.processResourcesPath ?? process.resourcesPath;
  const isPackaged = args.isPackaged ?? false;
  const repoRoot = isPackaged ? join(processResourcesPath, 'app.asar') : resolve(desktopRoot, '..', '..');
  const unpackedRepoRoot = isPackaged ? join(processResourcesPath, 'app.asar.unpacked') : null;
  const scriptRoot = unpackedRepoRoot ?? repoRoot;
  const packagedDesktopRoot = isPackaged ? join(processResourcesPath, 'app.asar', 'apps', 'desktop') : desktopRoot;
  const packagedWebRoot = isPackaged
    ? join(processResourcesPath, 'web-runtime', 'apps', 'pdf-af-web')
    : join(scriptRoot, 'apps', 'pdf-af-web');

  return {
    repoRoot,
    desktopRoot: packagedDesktopRoot,
    unpackedRepoRoot,
    apiEntry: join(scriptRoot, 'dist', 'server.js'),
    apiCwd: scriptRoot,
    webCwd: packagedWebRoot,
    webEntry: isPackaged
      ? join(processResourcesPath, 'web-runtime', 'apps', 'pdf-af-web', 'server.js')
      : join(scriptRoot, 'apps', 'pdf-af-web', '.next', 'standalone', 'apps', 'pdf-af-web', 'server.js'),
    preloadPath: join(packagedDesktopRoot, 'dist', 'preload.js'),
    trayIconPath: join(scriptRoot, 'apps', 'desktop', 'assets', 'tray.ico'),
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
  if (!paths.buildMetadataPath || !existsSync(paths.buildMetadataPath)) {
    missing.push(`Bundled build metadata missing: ${paths.buildMetadataPath ?? '(not set)'}`);
  }
  if (!paths.webRuntimeRoot || !existsSync(paths.webRuntimeRoot)) {
    missing.push(`Bundled web runtime root missing: ${paths.webRuntimeRoot ?? '(not set)'}`);
  }
  if (!paths.webRuntimeNodeModulesPath || !existsSync(paths.webRuntimeNodeModulesPath)) {
    missing.push(`Bundled web runtime modules missing: ${paths.webRuntimeNodeModulesPath ?? '(not set)'}`);
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

export function parseDesktopBuildMetadata(raw: string): DesktopBuildMetadataSummary {
  const parsed = JSON.parse(raw) as {
    appVersion?: string;
    gitCommit?: string | null;
    buildTimestamp?: string;
    signingConfigured?: boolean;
  };

  return {
    appVersion: parsed.appVersion ?? 'unknown',
    gitCommit: typeof parsed.gitCommit === 'string' ? parsed.gitCommit : null,
    buildTimestamp: parsed.buildTimestamp ?? 'unknown',
    signingConfigured: parsed.signingConfigured === true,
  };
}
