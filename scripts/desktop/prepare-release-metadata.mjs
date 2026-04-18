import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const packageJsonPath = join(repoRoot, 'package.json');
const releaseDir = join(repoRoot, 'apps', 'desktop', '.release');
const outputPath = join(releaseDir, 'build-metadata.json');

function getGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const signingConfigured = Boolean(
    process.env['CSC_LINK'] ||
      process.env['WIN_CSC_LINK'] ||
      process.env['CSC_NAME'] ||
      process.env['WIN_CSC_NAME'],
  );

  await mkdir(releaseDir, { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        appVersion: packageJson.version,
        gitCommit: getGitCommit(),
        buildTimestamp: new Date().toISOString(),
        signingConfigured,
      },
      null,
      2,
    ),
    'utf8',
  );
  process.stdout.write(`[desktop-release] Wrote ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
