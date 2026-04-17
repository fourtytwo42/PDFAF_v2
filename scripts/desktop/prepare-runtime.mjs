import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const desktopRoot = join(repoRoot, 'apps', 'desktop');
const runtimeRoot = join(desktopRoot, '.runtime', 'win32-x64');
const cacheRoot = join(desktopRoot, '.runtime-cache');

const defaultManifest = {
  node: {
    version: process.version.replace(/^v/, ''),
    source: process.execPath,
  },
  python: {
    version: '3.11.9',
    url: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip',
    md5: '6d9aa08531d48fcc261ba667e2df17c4',
    getPipUrl: 'https://bootstrap.pypa.io/get-pip.py',
    packages: ['pikepdf==10.5.1', 'fonttools==4.62.1'],
  },
  qpdf: {
    version: '12.3.2',
    url: 'https://github.com/qpdf/qpdf/releases/download/v12.3.2/qpdf-12.3.2-msvc64.zip',
    sha256: '8941870a604e7c87ed24566b038d46c24ce76616254d2383c578f60c0677f202',
  },
};

function log(message) {
  process.stdout.write(`[desktop-runtime] ${message}\n`);
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
      ...options,
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

async function downloadFile(url, destination) {
  log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  await ensureDir(dirname(destination));
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function md5File(path) {
  const buffer = await readFile(path);
  return createHash('md5').update(buffer).digest('hex');
}

async function sha256File(path) {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureDownloaded(url, destination) {
  if (!(await fileExists(destination))) {
    await downloadFile(url, destination);
  }
}

async function extractZip(zipPath, destination) {
  await rm(destination, { recursive: true, force: true });
  await ensureDir(destination);
  await run('powershell', [
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
  ]);
}

async function firstDirectory(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const dir = entries.find(entry => entry.isDirectory());
  return dir ? join(path, dir.name) : null;
}

async function stageNode() {
  const nodeStageDir = join(runtimeRoot, 'node');
  await ensureDir(nodeStageDir);
  await copyFile(process.execPath, join(nodeStageDir, 'node.exe'));
  log(`Staged Node runtime: ${join(nodeStageDir, 'node.exe')}`);
}

async function stagePython() {
  const zipPath = join(cacheRoot, `python-${defaultManifest.python.version}-embed-amd64.zip`);
  const getPipPath = join(cacheRoot, 'get-pip.py');
  const pythonStageDir = join(runtimeRoot, 'python');

  await ensureDownloaded(defaultManifest.python.url, zipPath);
  const md5 = await md5File(zipPath);
  if (md5 !== defaultManifest.python.md5) {
    throw new Error(`Python runtime checksum mismatch for ${zipPath}. Expected ${defaultManifest.python.md5}, got ${md5}.`);
  }

  await extractZip(zipPath, pythonStageDir);
  await ensureDownloaded(defaultManifest.python.getPipUrl, getPipPath);

  const pthPath = join(pythonStageDir, 'python311._pth');
  const pth = await readFile(pthPath, 'utf8');
  await writeFile(
    pthPath,
    pth.includes('#import site') ? pth.replace('#import site', 'import site') : pth,
    'utf8',
  );

  const pythonExe = join(pythonStageDir, 'python.exe');
  const sitePackages = join(pythonStageDir, 'Lib', 'site-packages');
  const pythonEnv = {
    ...process.env,
    PYTHONNOUSERSITE: '1',
    PYTHONPATH: '',
  };
  await ensureDir(sitePackages);

  await run(pythonExe, [getPipPath, '--no-warn-script-location'], { cwd: pythonStageDir, env: pythonEnv });
  await run(
    pythonExe,
    [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-warn-script-location',
      '--upgrade',
      '--target',
      sitePackages,
      ...defaultManifest.python.packages,
    ],
    { cwd: pythonStageDir, env: pythonEnv },
  );

  log(`Staged Python runtime: ${pythonExe}`);
}

async function stageQpdf() {
  const zipPath = join(cacheRoot, `qpdf-${defaultManifest.qpdf.version}-msvc64.zip`);
  const tempExtractDir = join(cacheRoot, `qpdf-${defaultManifest.qpdf.version}-extract`);
  const qpdfStageDir = join(runtimeRoot, 'qpdf');

  await ensureDownloaded(defaultManifest.qpdf.url, zipPath);
  const sha256 = await sha256File(zipPath);
  if (sha256 !== defaultManifest.qpdf.sha256) {
    throw new Error(`qpdf runtime checksum mismatch for ${zipPath}. Expected ${defaultManifest.qpdf.sha256}, got ${sha256}.`);
  }

  await extractZip(zipPath, tempExtractDir);
  const extractedRoot = await firstDirectory(tempExtractDir);
  if (!extractedRoot) {
    throw new Error(`qpdf archive did not contain an extracted directory: ${zipPath}`);
  }

  await rm(qpdfStageDir, { recursive: true, force: true });
  await run('powershell', [
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `Copy-Item -LiteralPath '${extractedRoot.replace(/'/g, "''")}' -Destination '${qpdfStageDir.replace(/'/g, "''")}' -Recurse -Force`,
  ]);

  const qpdfExe = join(qpdfStageDir, 'bin', 'qpdf.exe');
  if (!(await fileExists(qpdfExe))) {
    throw new Error(`Expected qpdf.exe at ${qpdfExe}`);
  }

  log(`Staged qpdf runtime: ${qpdfExe}`);
}

async function writeManifest() {
  const manifestPath = join(runtimeRoot, 'manifest.json');
  const entries = [];
  for (const rel of ['node', 'python', 'qpdf']) {
    const abs = join(runtimeRoot, rel);
    const s = await stat(abs);
    entries.push({ name: rel, size: s.size || 0 });
  }
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: 'win32-x64',
        versions: defaultManifest,
        entries,
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('desktop:runtime:prepare currently supports only win32-x64 build hosts.');
  }

  await ensureDir(cacheRoot);
  await rm(runtimeRoot, { recursive: true, force: true });
  await ensureDir(runtimeRoot);

  await stageNode();
  await stagePython();
  await stageQpdf();
  await writeManifest();

  log(`Runtime staging complete under ${runtimeRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
