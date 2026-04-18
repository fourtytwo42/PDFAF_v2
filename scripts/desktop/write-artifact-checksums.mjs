import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const distRoot = join(repoRoot, 'apps', 'desktop', 'dist-packaged');
const releaseDir = join(repoRoot, 'apps', 'desktop', '.release');
const checksumsPath = join(distRoot, 'SHA256SUMS.txt');
const buildMetadataPath = join(releaseDir, 'build-metadata.json');
const releaseMetadataPath = join(distRoot, 'release-metadata.json');

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

  const checksumLines = [];
  const artifactChecksums = [];
  for (const file of artifactFiles.sort()) {
    const abs = join(distRoot, file);
    const sha = await sha256File(abs);
    checksumLines.push(`${sha} *${basename(abs)}`);
    artifactChecksums.push({ file, sha256: sha });
  }

  await writeFile(checksumsPath, `${checksumLines.join('\n')}\n`, 'utf8');

  const buildMetadata = JSON.parse(await readFile(buildMetadataPath, 'utf8'));
  await writeFile(
    releaseMetadataPath,
    JSON.stringify(
      {
        ...buildMetadata,
        generatedAt: new Date().toISOString(),
        artifacts: artifactChecksums,
      },
      null,
      2,
    ),
    'utf8',
  );
  process.stdout.write(`[desktop-release] Wrote ${checksumsPath}\n`);
  process.stdout.write(`[desktop-release] Wrote ${releaseMetadataPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
