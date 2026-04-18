import { join, resolve } from 'node:path';
import { LocalLlmManager } from './localLlm.js';

interface CliArgs {
  appDataDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  let appDataDir = process.env['PDFAF_APP_DATA_DIR']?.trim() || '';

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;

    if (current === '--app-data-dir') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --app-data-dir.');
      }
      appDataDir = next;
      index += 1;
    }
  }

  if (!appDataDir) {
    const roamingAppData = process.env['APPDATA']?.trim();
    if (!roamingAppData) {
      throw new Error('Could not resolve APPDATA for local AI installation.');
    }
    appDataDir = join(roamingAppData, 'pdfaf-v2', 'data');
  }

  return {
    appDataDir: resolve(appDataDir),
  };
}

function printProgressLine(message: string): void {
  process.stdout.write(`[PDFAF-Installer] ${message}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const llmRootDir = join(args.appDataDir, 'llm');
  let lastPrintedSignature = '';
  let lastProgressBytes = 0;

  const manager = new LocalLlmManager({
    llmRootDir,
    onStateChange: (state) => {
      let message = '';

      if (state.status === 'removing') {
        message = 'Removing existing local AI files...';
      } else if (state.status === 'failed') {
        message = state.lastError
          ? `Local AI install failed: ${state.lastError}`
          : 'Local AI install failed.';
      } else if (state.status === 'installed' && state.enabled) {
        message = 'Local AI is installed and enabled.';
      } else if (state.currentStep === 'downloading_runtime') {
        const downloadedMb = (state.downloadedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = state.totalBytes ? (state.totalBytes / (1024 * 1024)).toFixed(1) : 'unknown';
        message = `Downloading local AI runtime (${downloadedMb} MB of ${totalMb} MB): ${state.currentArtifact ?? 'runtime'}`;
      } else if (state.currentStep === 'downloading_model') {
        const downloadedGb = (state.downloadedBytes / (1024 * 1024 * 1024)).toFixed(2);
        const totalGb = state.totalBytes ? (state.totalBytes / (1024 * 1024 * 1024)).toFixed(2) : 'unknown';
        message = `Downloading local AI model (${downloadedGb} GB of ${totalGb} GB): ${state.currentArtifact ?? 'model'}`;
      } else if (state.currentStep === 'verifying') {
        message = 'Verifying local AI files...';
      } else if (state.currentStep === 'finalizing') {
        message = 'Finalizing local AI setup...';
      }

      if (!message) return;

      const signature = `${state.status}|${state.currentStep}|${state.currentArtifact ?? ''}|${message}`;
      const shouldPrintProgress =
        state.currentStep === 'downloading_runtime' || state.currentStep === 'downloading_model';

      if (shouldPrintProgress) {
        const stepBytes = Math.abs(state.downloadedBytes - lastProgressBytes);
        if (signature === lastPrintedSignature && stepBytes < 64 * 1024 * 1024) {
          return;
        }
        lastProgressBytes = state.downloadedBytes;
      } else if (signature === lastPrintedSignature) {
        return;
      }

      lastPrintedSignature = signature;
      printProgressLine(message);
    },
    log: (message) => printProgressLine(message),
  });

  await manager.initialize();
  const initialState = manager.getState();

  if (initialState.status === 'installed' && initialState.enabled && initialState.available) {
    printProgressLine('Local AI is already installed.');
    return;
  }

  if (initialState.status === 'installed' && !initialState.enabled) {
    printProgressLine('Enabling existing local AI install...');
    await manager.setEnabled(true);
    return;
  }

  printProgressLine('Preparing required local AI setup...');
  await manager.install();
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[PDFAF-Installer] ${message}\n`);
  process.exitCode = 1;
});
