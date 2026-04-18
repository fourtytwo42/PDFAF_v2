import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const runtimeRoot = join(repoRoot, 'apps', 'desktop', '.web-runtime-packaged');
const appRoot = join(runtimeRoot, 'apps', 'pdf-af-web');
const nodeModulesRoot = join(runtimeRoot, 'node_modules');
const manifestPath = join(runtimeRoot, 'manifest.json');

const requiredPackages = [
  'better-sqlite3',
  'next',
  'react',
  'react-dom',
  'styled-jsx',
  '@swc/helpers',
];

async function requirePath(path) {
  await access(path);
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
  await requirePath(join(appRoot, 'server.js'));
  await requirePath(join(appRoot, '.next'));
  await requirePath(nodeModulesRoot);
  await requirePath(manifestPath);
  await requirePath(join(nodeModulesRoot, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'));

  for (const packageName of requiredPackages) {
    await requirePath(join(nodeModulesRoot, ...packageName.split('/')));
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const topLevelEntries = (await readdir(runtimeRoot, { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort();
  const appEntries = (await readdir(appRoot, { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort();
  const sizeMb = (await directorySize(runtimeRoot)) / (1024 * 1024);

  process.stdout.write(
    JSON.stringify(
      {
        runtimeRoot,
        sizeMb: Number(sizeMb.toFixed(2)),
        topLevelEntries,
        appEntries,
        requiredPackages,
        materializedPackageCount: Array.isArray(manifest.materializedPackages)
          ? manifest.materializedPackages.length
          : 0,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
