#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface EvolveArgs {
  stage?: number;
  mode: string;
  batchSize: number;
  maxBatches?: number;
  forever: boolean;
  sleepSeconds: number;
  maxIterations: number;
  pollSeconds: number;
  parkedRepeatLimit: number;
  corpora: string;
  outRoot: string;
  dryRun: boolean;
  allowDirty: boolean;
  pullV1WhenNeeded: boolean;
  visualGate: boolean;
  protectedBaselineRun?: string;
  xhighTaskClasses: string;
  extraObjective: string;
}

interface StageSummary {
  stage?: number;
  classification?: string;
  next_action?: string;
}

const DEFAULT_OUT_ROOT = 'Output/agent-runs';
const DEFAULT_XHIGH_TASK_CLASSES = 'hard-planning,boundary-policy,full-gate,protected,analyzer,determinism,architecture,release,acceptance';

function usage(): string {
  return [
    'Usage: ./scripts/codex-evolve.sh [options]',
    '',
    'Options:',
    '  --stage <n>                    First stage. Defaults to latest Output/agent-runs stage + 1.',
    '  --forever                      Keep launching bounded batches until stopped or a hard error occurs.',
    '  --max-batches <n>              Default: 1 unless --forever is passed. Optional cap for --forever.',
    '  --batch-size <n>               Default: 10. Passed to codex-stage as --max-stages.',
    '  --sleep-seconds <n>            Default: 300 between batches in --forever mode.',
    '  --mode <name>                  Default: diagnostic-first.',
    '  --corpora <csv>                Default: legacy,v1-edge.',
    '  --max-iterations <n>           Default: 1.',
    '  --poll-seconds <n>             Default: 30.',
    '  --parked-repeat-limit <n>      Default: 3. Stops a batch after repeated parked diagnostics for one topic.',
    '  --pull-v1-when-needed          Tell workers to select small v1 PDF batches when evidence needs them.',
    '  --visual-gate                  Tell workers to include before/after visual stability validation for behavior changes.',
    '  --protected-baseline-run <dir> Protected baseline for acceptance/full-gate work.',
    `  --xhigh-task-classes <csv>      Default: ${DEFAULT_XHIGH_TASK_CLASSES}`,
    '  --objective <text>             Extra objective appended to the evolution prompt.',
    `  --out-root <path>              Default: ${DEFAULT_OUT_ROOT}`,
    '  --dry-run                      Exercise the loop without launching Codex workers.',
    '  --allow-dirty                  Allow tracked changes before launching stage workers.',
  ].join('\n');
}

function parseArgs(argv: string[]): EvolveArgs {
  const args: EvolveArgs = {
    mode: 'diagnostic-first',
    batchSize: 10,
    forever: false,
    sleepSeconds: 300,
    maxIterations: 1,
    pollSeconds: 30,
    parkedRepeatLimit: 3,
    corpora: 'legacy,v1-edge',
    outRoot: DEFAULT_OUT_ROOT,
    dryRun: false,
    allowDirty: false,
    pullV1WhenNeeded: false,
    visualGate: false,
    xhighTaskClasses: DEFAULT_XHIGH_TASK_CLASSES,
    extraObjective: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--forever') {
      args.forever = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--allow-dirty') {
      args.allowDirty = true;
      continue;
    }
    if (arg === '--pull-v1-when-needed') {
      args.pullV1WhenNeeded = true;
      continue;
    }
    if (arg === '--visual-gate') {
      args.visualGate = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--stage') args.stage = positiveInt(next, arg);
    else if (arg === '--batch-size') args.batchSize = Math.max(1, Math.min(20, positiveInt(next, arg)));
    else if (arg === '--max-batches') args.maxBatches = Math.max(1, positiveInt(next, arg));
    else if (arg === '--sleep-seconds') args.sleepSeconds = Math.max(0, positiveInt(next, arg));
    else if (arg === '--max-iterations') args.maxIterations = Math.max(1, Math.min(5, positiveInt(next, arg)));
    else if (arg === '--poll-seconds') args.pollSeconds = Math.max(5, positiveInt(next, arg));
    else if (arg === '--parked-repeat-limit') args.parkedRepeatLimit = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--mode') args.mode = next;
    else if (arg === '--corpora') args.corpora = next;
    else if (arg === '--out-root') args.outRoot = next;
    else if (arg === '--protected-baseline-run') args.protectedBaselineRun = next;
    else if (arg === '--xhigh-task-classes') args.xhighTaskClasses = next;
    else if (arg === '--objective') args.extraObjective = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }

  if (!args.forever && !args.maxBatches) args.maxBatches = 1;
  return args;
}

function positiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

async function latestAgentStage(outRoot: string): Promise<number | undefined> {
  try {
    const names = await readdir(outRoot);
    const stages = names
      .map(name => /^stage(\d+)-/.exec(name)?.[1])
      .filter((stage): stage is string => Boolean(stage))
      .map(stage => Number.parseInt(stage, 10))
      .filter(Number.isInteger);
    return stages.length ? Math.max(...stages) : undefined;
  } catch {
    return undefined;
  }
}

async function command(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolveRun => {
    const proc = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => resolveRun({ code: 127, stdout, stderr: error.message }));
    proc.on('close', code => resolveRun({ code: code ?? 0, stdout, stderr }));
  });
}

async function trackedDirty(): Promise<string> {
  const diff = await command('git', ['diff', '--name-only']);
  const cached = await command('git', ['diff', '--cached', '--name-only']);
  return [diff.stdout.trim(), cached.stdout.trim()].filter(Boolean).join('\n');
}

async function diskStatus(): Promise<string> {
  const result = await command('df', ['-h', '.']);
  return result.stdout.trim() || result.stderr.trim() || 'unavailable';
}

async function llmStatus(): Promise<string> {
  const proc = await command('bash', ['-lc', "pgrep -af 'llama-server|llama.cpp|server.*llama' || true"]);
  const ports = await command('bash', ['-lc', "ss -ltnp 2>/dev/null | rg ':(6200|8080|8000|11434|4891|1234)\\b' || true"]);
  return [`Processes:\n${proc.stdout.trim() || 'none'}`, `Listeners:\n${ports.stdout.trim() || 'none'}`].join('\n\n');
}

function buildObjective(args: EvolveArgs, stage: number): string {
  const parts = [
    'Evolve PDFAF Engine v2 over bounded stages. Improve general PDF accessibility remediation while preserving processing speed, avoiding regressions, and keeping rendered PDFs visually unchanged.',
    'Prefer evidence-first diagnostics, then narrow general implementation only when a safe rule is proven.',
    'Every accepted behavior change must protect false-positive applied = 0, protected rows, F count, runtime p95, text extraction, structure/tag state, page count, and visual stability.',
    'Reject or revert candidates that overfit, broaden route guards without evidence, change scorer/gate semantics, or alter visible rendering.',
    'Do not spend repeated stages reaffirming one parked topic. If a family is parked with no implementation justified, pivot to a different residual family or stop with a clear blocked decision.',
    `This batch starts at Stage ${stage} and may run up to ${args.batchSize} stage(s).`,
  ];
  if (args.protectedBaselineRun) {
    parts.push(`Use protected baseline run ${args.protectedBaselineRun} for protected/full-gate acceptance work.`);
  }
  if (args.visualGate) {
    parts.push('For any remediation behavior change, add or run visual stability checks using before/after renders or equivalent pixel/perceptual comparison; do not accept visible drift.');
  }
  if (args.pullV1WhenNeeded) {
    parts.push('When existing corpora are insufficient, pull only a small justified set of matching PDFs from available v1/sibling PDF corpora into ignored local Input/from_sibling_pdfaf_v1_evolve/ manifests. Do not commit PDFs or generated payloads.');
  }
  if (args.extraObjective.trim()) parts.push(args.extraObjective.trim());
  return parts.join(' ');
}

function stageArgs(args: EvolveArgs, stage: number): string[] {
  const out = [
    '--continuous',
    '--stage', String(stage),
    '--max-stages', String(args.batchSize),
    '--max-iterations', String(args.maxIterations),
    '--poll-seconds', String(args.pollSeconds),
    '--parked-repeat-limit', String(args.parkedRepeatLimit),
    '--mode', args.mode,
    '--corpora', args.corpora,
    '--out-root', args.outRoot,
    '--xhigh-task-classes', args.xhighTaskClasses,
    '--objective', buildObjective(args, stage),
  ];
  if (args.allowDirty) out.push('--allow-dirty');
  if (args.dryRun) out.push('--dry-run');
  return out;
}

async function runStageBatch(args: EvolveArgs, stage: number): Promise<number> {
  const childArgs = stageArgs(args, stage);
  console.log('');
  console.log(`=== Evolve batch starting at Stage ${stage}; batch size ${args.batchSize} ===`);
  console.log(`Command: ./scripts/codex-stage.sh ${childArgs.map(quoteArg).join(' ')}`);
  if (args.dryRun) {
    console.log('Dry run: launching stage runner in dry-run mode.');
  }
  await new Promise<void>((resolveRun, reject) => {
    const proc = spawn('./scripts/codex-stage.sh', childArgs, { cwd: process.cwd(), stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolveRun();
      else reject(new Error(`codex-stage batch failed with exit ${code}`));
    });
  });
  return nextStageAfterBatch(args.outRoot, stage);
}

function quoteArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

async function nextStageAfterBatch(outRoot: string, fallbackStage: number): Promise<number> {
  const latest = await latestAgentStage(outRoot);
  return latest && latest >= fallbackStage ? latest + 1 : fallbackStage + 1;
}

async function writeState(path: string, state: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

async function readLatestSummaries(outRoot: string, limit = 8): Promise<StageSummary[]> {
  let dirs: string[] = [];
  try {
    dirs = (await readdir(outRoot))
      .filter(name => /^stage\d+-/.test(name))
      .sort()
      .slice(-limit);
  } catch {
    return [];
  }

  const summaries: StageSummary[] = [];
  for (const dir of dirs) {
    try {
      const files = (await readdir(join(outRoot, dir))).filter(name => /^iteration-\d+-summary\.json$/.test(name)).sort();
      const file = files.at(-1);
      if (!file) continue;
      summaries.push(JSON.parse(await readFile(join(outRoot, dir, file), 'utf8')) as StageSummary);
    } catch {
      // Keep evolve status best-effort; worker artifacts remain on disk.
    }
  }
  return summaries;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dirty = await trackedDirty();
  if (dirty && !args.allowDirty) {
    throw new Error(`Tracked worktree changes exist. Commit/stash them or pass --allow-dirty.\n${dirty}`);
  }

  let stage = args.stage ?? ((await latestAgentStage(args.outRoot)) ?? 0) + 1;
  if (!Number.isInteger(stage) || stage <= 0) throw new Error('Could not determine start stage; pass --stage <n>.');

  const runRoot = resolve(args.outRoot, 'evolve');
  await mkdir(runRoot, { recursive: true });
  const statePath = join(runRoot, 'latest-state.json');
  const maxBatches = args.maxBatches ?? Number.POSITIVE_INFINITY;

  console.log('PDFAF evolve runner');
  console.log(`Start stage: ${stage}`);
  console.log(`Batch size: ${args.batchSize}`);
  console.log(`Forever: ${args.forever}`);
  console.log(`Max batches: ${Number.isFinite(maxBatches) ? maxBatches : 'unbounded'}`);
  console.log(`Disk:\n${await diskStatus()}`);
  console.log(`LLM status:\n${await llmStatus()}`);

  for (let batch = 1; batch <= maxBatches; batch += 1) {
    const startedAt = new Date().toISOString();
    const nextStage = await runStageBatch(args, stage);
    const summaries = await readLatestSummaries(args.outRoot);
    await writeState(statePath, {
      updatedAt: new Date().toISOString(),
      lastBatch: batch,
      batchStartedAt: startedAt,
      previousStage: stage,
      nextStage,
      args,
      latestSummaries: summaries,
    });
    stage = nextStage;
    if (!args.forever && batch >= maxBatches) break;
    if (args.sleepSeconds > 0) {
      console.log(`Sleeping ${args.sleepSeconds}s before next evolve batch. State: ${statePath}`);
      await sleep(args.sleepSeconds * 1000);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
