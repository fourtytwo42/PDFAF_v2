import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const distRoot = join(repoRoot, 'apps', 'desktop', 'dist-packaged');
const unpackedRoot = join(distRoot, 'win-unpacked');
const resourcesRoot = join(unpackedRoot, 'resources');
const runtimeRoot = join(resourcesRoot, 'runtime');
const apiRuntimeRoot = join(resourcesRoot, 'api-runtime');
const webRuntimeRoot = join(resourcesRoot, 'web-runtime');

async function requirePath(path) {
  await access(path);
}

async function allocatePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate port.')));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

async function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 503) {
        return Date.now() - start;
      }
    } catch {
      // continue polling
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill('SIGTERM');
  });
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
  const requiredArtifacts = [
    join(unpackedRoot, 'PDFAF.exe'),
    join(runtimeRoot, 'manifest.json'),
    join(apiRuntimeRoot, 'manifest.json'),
    join(resourcesRoot, 'release', 'build-metadata.json'),
    join(runtimeRoot, 'node', 'node.exe'),
    join(runtimeRoot, 'python', 'python.exe'),
    join(runtimeRoot, 'qpdf', 'bin', 'qpdf.exe'),
    join(webRuntimeRoot, 'manifest.json'),
    join(webRuntimeRoot, 'node_modules'),
    join(apiRuntimeRoot, 'node_modules'),
    join(apiRuntimeRoot, 'dist', 'server.js'),
    join(webRuntimeRoot, 'apps', 'pdf-af-web', 'server.js'),
    join(webRuntimeRoot, 'apps', 'pdf-af-web', '.next'),
  ];
  await Promise.all(requiredArtifacts.map((path) => requirePath(path)));

  const nodeBin = join(runtimeRoot, 'node', 'node.exe');
  const apiEntry = join(apiRuntimeRoot, 'dist', 'server.js');
  const webEntry = join(webRuntimeRoot, 'apps', 'pdf-af-web', 'server.js');
  const apiCwd = apiRuntimeRoot;
  const webCwd = join(webRuntimeRoot, 'apps', 'pdf-af-web');
  const qaRoot = join(distRoot, '.qa-runtime');
  await mkdir(join(qaRoot, 'db'), { recursive: true });
  await mkdir(join(qaRoot, 'files'), { recursive: true });
  await mkdir(join(qaRoot, 'llm'), { recursive: true });
  const apiPort = await allocatePort();
  const webPort = await allocatePort();
  const sharedEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    HOSTNAME: '127.0.0.1',
    PORT: String(apiPort),
    PDFAF_NODE_BIN: nodeBin,
    PDFAF_PYTHON_BIN: join(runtimeRoot, 'python', 'python.exe'),
    PDFAF_QPDF_BIN: join(runtimeRoot, 'qpdf', 'bin', 'qpdf.exe'),
    PDFAF_DESKTOP_MODE: '1',
    PDFAF_APP_DATA_DIR: qaRoot,
    DB_PATH: join(qaRoot, 'db', 'pdfaf.db'),
    PDF_AF_STORAGE_DIR: join(qaRoot, 'files'),
    PDF_AF_STORAGE_POLICY: 'desktop-persistent',
    PDFAF_LLAMA_WORKDIR: join(qaRoot, 'llm'),
  };

  const apiChild = spawn(nodeBin, [apiEntry], {
    cwd: apiCwd,
    env: {
      ...sharedEnv,
      NODE_PATH: join(apiRuntimeRoot, 'node_modules'),
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  let apiStartupMs = 0;
  let webStartupMs = 0;

  try {
    apiStartupMs = await waitForUrl(`http://127.0.0.1:${apiPort}/v1/health`);
    const webChild = spawn(nodeBin, [webEntry], {
      cwd: webCwd,
      env: {
        ...sharedEnv,
        NODE_PATH: join(webRuntimeRoot, 'node_modules'),
        PORT: String(webPort),
        PDFAF_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      },
      stdio: 'ignore',
      windowsHide: true,
    });

    try {
      webStartupMs = await waitForUrl(`http://127.0.0.1:${webPort}/`);
    } finally {
      await stopChild(webChild);
    }
  } finally {
    await stopChild(apiChild);
  }

  const releaseMetadataPath = join(distRoot, 'release-metadata.json');
  const checksumPath = join(distRoot, 'SHA256SUMS.txt');
  const packagedArtifacts = [];
  try {
    await requirePath(releaseMetadataPath);
    packagedArtifacts.push('release-metadata.json');
  } catch {}
  try {
    await requirePath(checksumPath);
    packagedArtifacts.push('SHA256SUMS.txt');
  } catch {}

  const summary = {
    apiRuntimeSizeMb: Number(((await directorySize(apiRuntimeRoot)) / (1024 * 1024)).toFixed(2)),
    webRuntimeSizeMb: Number(((await directorySize(webRuntimeRoot)) / (1024 * 1024)).toFixed(2)),
    apiRuntimeTopLevel: (await readdir(apiRuntimeRoot, { withFileTypes: true }))
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
      .sort(),
    webRuntimeTopLevel: (await readdir(webRuntimeRoot, { withFileTypes: true }))
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
      .sort(),
    apiStartupMs,
    webStartupMs,
    packagedArtifacts,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write('[desktop-release] Verified packaged win-unpacked runtime.\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
