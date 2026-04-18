import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const distRoot = join(repoRoot, 'apps', 'desktop', 'dist-packaged');
const outputPath = join(distRoot, 'SHA256SUMS.txt');

async function sha256File(path) {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const entries = await readdir(distRoot, { withFileTypes: true });
  const artifactFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ['.exe', '.blockmap', '.yml', '.yaml', '.zip'].includes(extname(name).toLowerCase()));

  const lines = [];
  for (const file of artifactFiles.sort()) {
    const abs = join(distRoot, file);
    const sha = await sha256File(abs);
    lines.push(`${sha} *${basename(abs)}`);
  }

  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`[desktop-release] Wrote ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
