import { createRequire } from 'node:module';
import { mkdir, cp, readFile, realpath, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const webRoot = join(repoRoot, 'apps', 'pdf-af-web');
const standaloneRoot = join(webRoot, '.next', 'standalone');
const standaloneAppRoot = join(standaloneRoot, 'apps', 'pdf-af-web');
const staticRoot = join(webRoot, '.next', 'static');
const publicRoot = join(webRoot, 'public');
const outputRoot = join(repoRoot, 'apps', 'desktop', '.web-runtime-packaged');
const outputNodeModulesRoot = join(outputRoot, 'node_modules');
const outputAppRoot = join(outputRoot, 'apps', 'pdf-af-web');
const outputAppNodeModulesRoot = join(outputAppRoot, 'node_modules');
const outputStatic = join(outputAppRoot, '.next', 'static');
const outputPublic = join(outputAppRoot, 'public');
const outputManifestPath = join(outputRoot, 'manifest.json');

const webRequire = createRequire(join(webRoot, 'package.json'));

function packagePath(rootPath, packageName) {
  return join(rootPath, ...packageName.split('/'));
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function findPackageRoot(startPath, expectedPackageName) {
  let currentPath = dirname(startPath);
  while (true) {
    const packageJsonPath = join(currentPath, 'package.json');
    try {
      const packageJson = await readJson(packageJsonPath);
      if (packageJson.name === expectedPackageName) {
        return await realpath(currentPath);
      }
    } catch {
      // continue walking upward
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error(`Could not find a package root for "${expectedPackageName}" starting at ${startPath}.`);
    }
    currentPath = parentPath;
  }
}

async function tryResolvePackageDir(packageName, packageRequire) {
  try {
    const packageJsonPath = packageRequire.resolve(`${packageName}/package.json`);
    return await realpath(dirname(packageJsonPath));
  } catch {}

  try {
    const entryPath = packageRequire.resolve(packageName);
    return await findPackageRoot(entryPath, packageName);
  } catch {
    return null;
  }
}

async function collectRuntimePackageGraph(entryPackages) {
  const visited = new Set();
  const packageDirs = new Map();
  const pending = entryPackages.map((packageName) => ({
    packageName,
    packageRequire: webRequire,
    optional: false,
  }));

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current.packageName)) continue;

    const packageDir = await tryResolvePackageDir(current.packageName, current.packageRequire);
    if (!packageDir) {
      if (current.optional) {
        continue;
      }
      throw new Error(`Could not resolve runtime package "${current.packageName}" for the packaged web runtime.`);
    }

    visited.add(current.packageName);
    packageDirs.set(current.packageName, packageDir);

    const packageJson = await readJson(join(packageDir, 'package.json'));
    const packageRequire = createRequire(join(packageDir, 'package.json'));
    const requiredDependencyNames = Object.keys(packageJson.dependencies ?? {});
    const optionalDependencyNames = Object.keys(packageJson.optionalDependencies ?? {});
    const dependencyNames = new Set(requiredDependencyNames);

    for (const peerDependencyName of Object.keys(packageJson.peerDependencies ?? {})) {
      if (await tryResolvePackageDir(peerDependencyName, packageRequire)) {
        dependencyNames.add(peerDependencyName);
      }
    }

    for (const dependencyName of dependencyNames) {
      if (!visited.has(dependencyName)) {
        pending.push({ packageName: dependencyName, packageRequire, optional: false });
      }
    }

    for (const dependencyName of optionalDependencyNames) {
      if (!visited.has(dependencyName)) {
        pending.push({ packageName: dependencyName, packageRequire, optional: true });
      }
    }
  }

  return packageDirs;
}

async function materializePackage(packageName, packageDir, destinationRoot) {
  const destinationPath = packagePath(destinationRoot, packageName);
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(packageDir, destinationPath, {
    recursive: true,
    force: true,
    dereference: true,
    verbatimSymlinks: false,
  });
  await rm(join(destinationPath, 'node_modules'), { recursive: true, force: true });
}

async function directorySize(path) {
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function main() {
  const webPackageJson = await readJson(join(webRoot, 'package.json'));
  const directDependencyNames = Object.keys(webPackageJson.dependencies ?? {}).sort();

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputNodeModulesRoot, { recursive: true });
  await mkdir(outputAppNodeModulesRoot, { recursive: true });

  const packageGraph = await collectRuntimePackageGraph(directDependencyNames);
  const materializedPackageNames = [...packageGraph.keys()].sort();

  for (const packageName of materializedPackageNames) {
    await materializePackage(packageName, packageGraph.get(packageName), outputNodeModulesRoot);
  }

  for (const packageName of directDependencyNames) {
    await materializePackage(packageName, packagePath(outputNodeModulesRoot, packageName), outputAppNodeModulesRoot);
  }

  await cp(join(standaloneAppRoot, 'server.js'), join(outputAppRoot, 'server.js'), { force: true });
  await cp(join(standaloneAppRoot, '.next'), join(outputAppRoot, '.next'), { recursive: true, force: true });
  await cp(staticRoot, outputStatic, { recursive: true, force: true });

  if (await pathExists(publicRoot)) {
    await cp(publicRoot, outputPublic, { recursive: true, force: true });
  }

  const totalBytes = await directorySize(outputRoot);
  await writeFile(
    outputManifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        directDependencies: directDependencyNames,
        materializedPackages: materializedPackageNames,
        totalBytes,
      },
      null,
      2,
    ),
    'utf8',
  );

  process.stdout.write(
    `[desktop-release] Staged standalone web runtime in ${outputRoot} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
