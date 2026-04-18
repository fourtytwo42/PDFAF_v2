import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const runtimeRoot = join(repoRoot, 'apps', 'desktop', '.api-runtime-packaged');
const nodeModulesRoot = join(runtimeRoot, 'node_modules');
const distRoot = join(runtimeRoot, 'dist');
const pythonRoot = join(runtimeRoot, 'python');
const manifestPath = join(runtimeRoot, 'manifest.json');

const requiredPackages = [
  '@napi-rs/canvas',
  'better-sqlite3',
  'dotenv',
  'express',
  'express-rate-limit',
  'multer',
  'pdf-lib',
  'pdfjs-dist',
  'zod',
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
  await requirePath(join(distRoot, 'server.js'));
  await requirePath(join(pythonRoot, 'pdf_analysis_helper.py'));
  await requirePath(nodeModulesRoot);
  await requirePath(manifestPath);

  for (const packageName of requiredPackages) {
    await requirePath(join(nodeModulesRoot, ...packageName.split('/')));
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const topLevelEntries = (await readdir(runtimeRoot, { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort();
  const sizeMb = (await directorySize(runtimeRoot)) / (1024 * 1024);

  process.stdout.write(
    JSON.stringify(
      {
        runtimeRoot,
        sizeMb: Number(sizeMb.toFixed(2)),
        topLevelEntries,
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
