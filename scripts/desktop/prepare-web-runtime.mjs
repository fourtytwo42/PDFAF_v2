import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const webRoot = join(repoRoot, 'apps', 'pdf-af-web');
const outputRoot = join(repoRoot, 'apps', 'desktop', '.web-runtime-packaged');
const standaloneAppRoot = join(webRoot, '.next', 'standalone', 'apps', 'pdf-af-web');
const staticRoot = join(webRoot, '.next', 'static');
const publicRoot = join(webRoot, 'public');
const outputAppRoot = join(outputRoot, 'apps', 'pdf-af-web');
const outputStatic = join(outputAppRoot, '.next', 'static');
const outputPublic = join(outputAppRoot, 'public');

function run(command, args) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows && command === 'powershell' ? 'powershell.exe' : command;
  const finalArgs = isWindows && command === 'pnpm' ? ['/d', '/s', '/c', 'pnpm', ...args] : args;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(isWindows && command === 'pnpm' ? 'cmd.exe' : executable, finalArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await run('pnpm', ['--filter', 'pdf-af-web', 'deploy', '--legacy', '--prod', outputRoot]);
  await Promise.all([
    rm(join(outputRoot, 'app'), { recursive: true, force: true }),
    rm(join(outputRoot, 'components'), { recursive: true, force: true }),
    rm(join(outputRoot, 'lib'), { recursive: true, force: true }),
    rm(join(outputRoot, 'stores'), { recursive: true, force: true }),
    rm(join(outputRoot, 'types'), { recursive: true, force: true }),
    rm(join(outputRoot, 'next-env.d.ts'), { force: true }),
    rm(join(outputRoot, 'next.config.ts'), { force: true }),
    rm(join(outputRoot, 'package.json'), { force: true }),
    rm(join(outputRoot, 'postcss.config.mjs'), { force: true }),
    rm(join(outputRoot, 'tsconfig.json'), { force: true }),
  ]);
  await rm(outputAppRoot, { recursive: true, force: true });
  await mkdir(outputAppRoot, { recursive: true });
  await run('powershell', [
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `Copy-Item -LiteralPath '${join(standaloneAppRoot, 'server.js').replace(/'/g, "''")}' -Destination '${join(outputAppRoot, 'server.js').replace(/'/g, "''")}' -Force`,
  ]);
  await run('powershell', [
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `Copy-Item -LiteralPath '${join(standaloneAppRoot, '.next').replace(/'/g, "''")}' -Destination '${join(outputAppRoot, '.next').replace(/'/g, "''")}' -Recurse -Force`,
  ]);
  await run('powershell', [
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `Copy-Item -LiteralPath '${staticRoot.replace(/'/g, "''")}' -Destination '${outputStatic.replace(/'/g, "''")}' -Recurse -Force`,
  ]);
  if (existsSync(publicRoot)) {
    await run('powershell', [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      `Copy-Item -LiteralPath '${publicRoot.replace(/'/g, "''")}' -Destination '${outputPublic.replace(/'/g, "''")}' -Recurse -Force`,
    ]);
  }
  process.stdout.write(`[desktop-release] Staged standalone web runtime in ${outputRoot}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
