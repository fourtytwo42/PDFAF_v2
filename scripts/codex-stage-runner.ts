#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface RunnerArgs {
  stage: number;
  mode: string;
  corpora: string;
  maxIterations: number;
  maxStages: number;
  pollSeconds: number;
  objective: string;
  promptTemplate: string;
  schema: string;
  outRoot: string;
  dryRun: boolean;
  allowDirty: boolean;
  continuous: boolean;
  rawEvents: boolean;
  model?: string;
}

interface StageDecision {
  classification?: string;
  next_action?: string;
}

const DEFAULT_PROMPT = 'docs/agent-prompts/coordinator-stage.md';
const DEFAULT_SCHEMA = 'schemas/codex-stage-decision.schema.json';
const DEFAULT_OUT_ROOT = 'Output/agent-runs';

function usage(): string {
  return [
    'Usage: pnpm run agent:improve-accessibility -- --stage <n> [options]',
    '',
    'Options:',
    '  --stage <n>              Required stage number for the next coordinated run.',
    '  --mode <name>            Default: diagnostic-first.',
    '  --corpora <csv>          Default: legacy,v1-edge.',
    '  --max-iterations <n>     Default: 1. Capped at 5.',
    '  --continuous             Run consecutive stage numbers until a stop classification is returned.',
    '  --max-stages <n>         Default: 1. Capped at 20. Used with --continuous.',
    '  --poll-seconds <n>       Default: 30. Heartbeat interval while Codex is running.',
    '  --objective <text>       Extra objective appended to the coordinator prompt.',
    `  --prompt <path>          Default: ${DEFAULT_PROMPT}`,
    `  --schema <path>          Default: ${DEFAULT_SCHEMA}`,
    `  --out-root <path>        Default: ${DEFAULT_OUT_ROOT}`,
    '  --model <name>           Optional Codex model override.',
    '  --dry-run                Write prompt/run metadata but do not launch Codex.',
    '  --allow-dirty            Allow existing tracked changes before launching Codex.',
    '  --raw-events             Stream raw Codex JSONL events instead of readable progress lines.',
  ].join('\n');
}

function parseArgs(argv: string[]): RunnerArgs {
  const args: RunnerArgs = {
    stage: 0,
    mode: 'diagnostic-first',
    corpora: 'legacy,v1-edge',
    maxIterations: 1,
    maxStages: 1,
    pollSeconds: 30,
    objective: 'Continue improving general PDF accessibility remediation with evidence-first staged work.',
    promptTemplate: DEFAULT_PROMPT,
    schema: DEFAULT_SCHEMA,
    outRoot: DEFAULT_OUT_ROOT,
    dryRun: false,
    allowDirty: false,
    continuous: false,
    rawEvents: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--allow-dirty') {
      args.allowDirty = true;
      continue;
    }
    if (arg === '--continuous') {
      args.continuous = true;
      continue;
    }
    if (arg === '--raw-events') {
      args.rawEvents = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--stage') args.stage = Number.parseInt(next, 10);
    else if (arg === '--mode') args.mode = next;
    else if (arg === '--corpora') args.corpora = next;
    else if (arg === '--max-iterations') args.maxIterations = Math.max(1, Math.min(5, Number.parseInt(next, 10) || 1));
    else if (arg === '--max-stages') args.maxStages = Math.max(1, Math.min(20, Number.parseInt(next, 10) || 1));
    else if (arg === '--poll-seconds') args.pollSeconds = Math.max(5, Number.parseInt(next, 10) || 30);
    else if (arg === '--objective') args.objective = next;
    else if (arg === '--prompt') args.promptTemplate = next;
    else if (arg === '--schema') args.schema = next;
    else if (arg === '--out-root') args.outRoot = next;
    else if (arg === '--model') args.model = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (!Number.isInteger(args.stage) || args.stage <= 0) throw new Error('--stage <n> is required.');
  return args;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

async function command(cmd: string, args: string[], options?: { input?: string }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolveRun => {
    const proc = spawn(cmd, args, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => resolveRun({ code: 127, stdout, stderr: error.message }));
    proc.on('close', code => resolveRun({ code: code ?? 0, stdout, stderr }));
    if (options?.input) proc.stdin.end(options.input);
    else proc.stdin.end();
  });
}

async function trackedDirty(): Promise<string> {
  const diff = await command('git', ['diff', '--name-only']);
  const cached = await command('git', ['diff', '--cached', '--name-only']);
  return [diff.stdout.trim(), cached.stdout.trim()].filter(Boolean).join('\n');
}

async function codexPath(): Promise<string> {
  const found = await command('bash', ['-lc', 'command -v codex || true']);
  if (found.stdout.trim()) return found.stdout.trim();
  const fallback = resolve(
    process.env.HOME ?? '',
    '.cursor-server/extensions/openai.chatgpt-26.422.21459-linux-x64/bin/linux-x86_64/codex',
  );
  try {
    await access(fallback);
    return fallback;
  } catch {
    throw new Error('codex CLI not found on PATH or known Cursor extension fallback path.');
  }
}

async function llmStatus(): Promise<string> {
  const proc = await command('bash', ['-lc', "pgrep -af 'llama-server|llama.cpp|server.*llama' || true"]);
  const ports = await command('bash', ['-lc', "ss -ltnp 2>/dev/null | rg ':(6200|8080|8000|11434|4891|1234)\\b' || true"]);
  return [`Processes:\n${proc.stdout.trim() || 'none'}`, `Listeners:\n${ports.stdout.trim() || 'none'}`].join('\n\n');
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) out = out.replaceAll(`{{${key}}}`, value);
  return out;
}

function forbiddenStaged(paths: string): string[] {
  return paths
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(path =>
      path.startsWith('Output/') ||
      path.startsWith('Input/') ||
      /\.(pdf|html|accreport|base64|png|jpg|jpeg)$/i.test(path)
    );
}

function compact(input: unknown, limit = 220): string {
  if (input === null || input === undefined) return '';
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > limit ? `${singleLine.slice(0, limit - 1)}...` : singleLine;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(source: Record<string, unknown> | null, ...keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function formatCodexEvent(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let event: Record<string, unknown>;
  try {
    const parsed = JSON.parse(trimmed);
    const parsedRecord = record(parsed);
    if (!parsedRecord) return `[codex] ${compact(trimmed)}`;
    event = parsedRecord;
  } catch {
    return `[codex] ${compact(trimmed)}`;
  }

  const type = stringField(event, 'type', 'event', 'status') || 'event';
  const item = record(event.item);
  const toolCall = record(event.tool_call) ?? record(event.toolCall) ?? record(event.call);
  const result = record(event.result);
  const message = stringField(event, 'message', 'msg', 'text', 'delta', 'summary')
    || stringField(item, 'message', 'text', 'name', 'type')
    || stringField(toolCall, 'name', 'type')
    || stringField(result, 'message', 'status');
  const commandText = stringField(event, 'cmd', 'command')
    || stringField(toolCall, 'cmd', 'command')
    || stringField(record(event.arguments), 'cmd', 'command');

  const lowerType = type.toLowerCase();
  if (lowerType.includes('delta') && message.length < 2) return null;
  if (commandText) return `[codex:${type}] ${compact(commandText)}`;
  if (message) return `[codex:${type}] ${compact(message)}`;

  const important = ['start', 'finish', 'complete', 'error', 'tool', 'command', 'exec', 'turn', 'task', 'agent', 'thread'];
  if (important.some(token => lowerType.includes(token))) return `[codex:${type}]`;
  return null;
}

function streamCodexChunk(text: string, lineBuffer: { value: string }, rawEvents: boolean): void {
  if (rawEvents) {
    process.stdout.write(text);
    return;
  }
  lineBuffer.value += text;
  const lines = lineBuffer.value.split(/\r?\n/);
  lineBuffer.value = lines.pop() ?? '';
  for (const line of lines) {
    const formatted = formatCodexEvent(line);
    if (formatted) console.log(formatted);
  }
}

function flushCodexChunk(lineBuffer: { value: string }, rawEvents: boolean): void {
  if (rawEvents) return;
  const formatted = formatCodexEvent(lineBuffer.value);
  if (formatted) console.log(formatted);
  lineBuffer.value = '';
}

async function runIteration(args: RunnerArgs, iteration: number, runDir: string): Promise<void> {
  const template = await readFile(args.promptTemplate, 'utf8');
  const prompt = renderTemplate(template, {
    STAGE: String(args.stage),
    MODE: args.mode,
    ITERATION: String(iteration),
    MAX_ITERATIONS: String(args.maxIterations),
    CORPORA: args.corpora,
    OBJECTIVE: args.objective,
  });
  const promptPath = join(runDir, `iteration-${iteration}-prompt.md`);
  const eventsPath = join(runDir, `iteration-${iteration}-events.jsonl`);
  const summaryPath = join(runDir, `iteration-${iteration}-summary.json`);
  await writeFile(promptPath, prompt, 'utf8');
  console.log(`Prompt: ${promptPath}`);

  if (args.dryRun) {
    await writeFile(summaryPath, JSON.stringify({
      dryRun: true,
      classification: 'diagnostic_only',
      next_action: 'Dry run only; inspect the generated prompt before launching Codex.',
      promptPath,
    }, null, 2), 'utf8');
    console.log(`Dry run wrote ${promptPath}`);
    return;
  }

  const codex = await codexPath();
  const codexArgs = [
    'exec',
    '--cd', process.cwd(),
    '--sandbox', 'danger-full-access',
    '--ask-for-approval', 'never',
    '--output-schema', resolve(args.schema),
    '--output-last-message', summaryPath,
    '--json',
  ];
  if (args.model) codexArgs.push('--model', args.model);
  codexArgs.push('-');

  await new Promise<void>((resolveRun, reject) => {
    const proc = spawn(codex, codexArgs, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const chunks: string[] = [];
    const lineBuffer = { value: '' };
    const started = Date.now();
    const heartbeat = setInterval(() => {
      const elapsedSeconds = Math.round((Date.now() - started) / 1000);
      console.log(`[codex-stage-runner] stage ${args.stage} iteration ${iteration} still running after ${elapsedSeconds}s`);
    }, args.pollSeconds * 1000);
    proc.stdout.on('data', chunk => {
      const text = String(chunk);
      chunks.push(text);
      streamCodexChunk(text, lineBuffer, args.rawEvents);
    });
    proc.stderr.on('data', chunk => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    proc.on('error', reject);
    proc.on('close', async code => {
      clearInterval(heartbeat);
      flushCodexChunk(lineBuffer, args.rawEvents);
      await writeFile(eventsPath, chunks.join(''), 'utf8');
      if (stderr.trim()) await writeFile(join(runDir, `iteration-${iteration}-stderr.log`), stderr, 'utf8');
      if (code === 0) resolveRun();
      else reject(new Error(`codex exec failed with exit ${code}`));
    });
    proc.stdin.end(prompt);
  });

  const staged = await command('git', ['diff', '--cached', '--name-only']);
  const bad = forbiddenStaged(staged.stdout);
  if (bad.length) {
    throw new Error(`Generated/artifact paths are staged and must be unstaged before commit:\n${bad.join('\n')}`);
  }
}

async function readDecision(summaryPath: string): Promise<StageDecision | null> {
  try {
    return JSON.parse(await readFile(summaryPath, 'utf8')) as StageDecision;
  } catch {
    return null;
  }
}

function shouldStopContinuous(decision: StageDecision | null): string | null {
  if (!decision?.classification) return 'missing_or_unparseable_summary';
  if (['blocked', 'rejected', 'acceptance_ready', 'safe_to_implement'].includes(decision.classification)) {
    return decision.classification;
  }
  return null;
}

async function runStage(args: RunnerArgs): Promise<{ runDir: string; decision: StageDecision | null }> {
  const runDir = resolve(args.outRoot, `stage${args.stage}-${stamp()}-${sha1(JSON.stringify(args)).slice(0, 8)}`);
  await mkdir(runDir, { recursive: true });

  const dirty = await trackedDirty();
  if (dirty && !args.allowDirty) {
    throw new Error(`Tracked worktree changes exist. Commit/stash them or pass --allow-dirty.\n${dirty}`);
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    args,
    cwd: process.cwd(),
    codex: args.dryRun ? null : await codexPath(),
    llmStatus: await llmStatus(),
  };
  await writeFile(join(runDir, 'run-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

  console.log('');
  console.log(`=== Stage ${args.stage} (${args.mode}) ===`);
  console.log(`Agent run dir: ${runDir}`);
  console.log(`Corpora: ${args.corpora}`);
  for (let i = 1; i <= args.maxIterations; i += 1) {
    console.log(`--- Iteration ${i}/${args.maxIterations} ---`);
    await runIteration(args, i, runDir);
  }
  const decision = await readDecision(join(runDir, `iteration-${args.maxIterations}-summary.json`));
  console.log(`Completed stage ${args.stage}. Output: ${runDir}`);
  if (decision?.classification) console.log(`Decision: ${decision.classification}`);
  if (decision?.next_action) console.log(`Next action: ${decision.next_action}`);
  return {
    runDir,
    decision,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const stageCount = args.continuous ? args.maxStages : 1;
  for (let offset = 0; offset < stageCount; offset += 1) {
    const stageArgs = { ...args, stage: args.stage + offset };
    const { decision } = await runStage(stageArgs);
    if (!args.continuous) break;
    const stopReason = shouldStopContinuous(decision);
    if (stopReason) {
      console.log(`Stopping continuous run after stage ${stageArgs.stage}: ${stopReason}`);
      if (decision?.next_action) console.log(`Next action: ${decision.next_action}`);
      break;
    }
    if (offset + 1 < stageCount) {
      console.log(`Continuing to stage ${stageArgs.stage + 1}`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
