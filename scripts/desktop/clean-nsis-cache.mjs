import { readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const distRoot = join(repoRoot, 'apps', 'desktop', 'dist-packaged');

async function main() {
  let removed = 0;
  const entries = await readdir(distRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.nsis.7z')) continue;
    await rm(join(distRoot, entry.name), { force: true });
    removed += 1;
  }

  process.stdout.write(`[desktop-release] Removed ${removed} stale NSIS cache file(s).\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
