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
  autoEscalate: boolean;
  parkedPivotAfter: number;
  parkedRepeatLimit: number;
  xhighTaskClasses: string;
  rawEvents: boolean;
  showCodexWarnings: boolean;
  modelPolicy: ModelPolicy;
  reasoningEffort?: ReasoningEffort;
  model?: string;
}

interface StageDecision {
  classification?: string;
  summary?: string;
  next_action?: string;
}

interface ContinuousStop {
  reason: string;
  canEscalate: boolean;
  escalationRequested: boolean;
  approvedTaskClass?: string;
}

type ModelPolicy = 'auto' | 'mini' | 'advanced' | 'xhigh';
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

interface ModelSelection {
  model: string;
  reasoningEffort: ReasoningEffort;
  policy: ModelPolicy;
  reason: string;
}

const DEFAULT_PROMPT = 'docs/agent-prompts/coordinator-stage.md';
const DEFAULT_SCHEMA = 'schemas/codex-stage-decision.schema.json';
const DEFAULT_OUT_ROOT = 'Output/agent-runs';
const DEFAULT_MINI_MODEL = 'gpt-5.4-mini';
const DEFAULT_ADVANCED_MODEL = 'gpt-5.5';
const DEFAULT_XHIGH_TASK_CLASSES = 'hard-planning,boundary-policy,full-gate,protected,analyzer,determinism,architecture,release,acceptance';

const XHIGH_TASK_PATTERNS: Record<string, RegExp> = {
  'hard-planning': /(?:hard[-_ ]?planning|deep[-_ ]?planning|hard[-_ ]?work)/i,
  acceptance: /(?:acceptance|acceptance[-_ ]?clean|end[-_ ]?gate)/i,
  'full-gate': /(?:full[-_ ]?gate|benchmark[-_ ]?gate|stage[-_ ]?41|gate[-_ ]?run)/i,
  protected: /(?:protected|protected[-_ ]?baseline|protected[-_ ]?parity|protected[-_ ]?regression)/i,
  analyzer: /(?:analyzer|analysis[-_ ]?determinism|python[-_ ]?structural|raw[-_ ]?python)/i,
  determinism: /(?:determinism|deterministic|repeat[-_ ]?preserving|same[-_ ]?buffer|volatility)/i,
  architecture: /(?:architecture|architectural|cross[-_ ]?module|broad[-_ ]?design)/i,
  release: /(?:release|tag|docker[-_ ]?push|checkpoint)/i,
  'boundary-policy': /(?:boundary[-_ ]?policy|boundary[-_ ]?handling|boundary[-_ ]?subtype)/i,
};

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
    '  --no-auto-escalate       Disable one-time xhigh reruns when a worker explicitly requests them.',
    '  --parked-pivot-after <n> Encourage pivot after N consecutive diagnostic-only parked decisions. Default: 2; 0 disables.',
    '  --parked-repeat-limit <n> Stop after N consecutive diagnostic-only parked decisions for one topic. Default: 4; 0 disables.',
    `  --xhigh-task-classes <csv> Approved task classes for auto-escalation. Default: ${DEFAULT_XHIGH_TASK_CLASSES}`,
    '  --max-stages <n>         Default: 1. Capped at 20. Used with --continuous.',
    '  --poll-seconds <n>       Default: 30. Heartbeat interval while Codex is running.',
    '  --objective <text>       Extra objective appended to the coordinator prompt.',
    `  --prompt <path>          Default: ${DEFAULT_PROMPT}`,
    `  --schema <path>          Default: ${DEFAULT_SCHEMA}`,
    `  --out-root <path>        Default: ${DEFAULT_OUT_ROOT}`,
    '  --model-policy <policy>  auto|mini|advanced|xhigh. Default: auto.',
    '  --model <name>           Optional Codex model override. Bypasses model policy model choice.',
    '  --reasoning-effort <e>   Optional low|medium|high|xhigh override.',
    '  --dry-run                Write prompt/run metadata but do not launch Codex.',
    '  --allow-dirty            Allow existing tracked changes before launching Codex.',
    '  --raw-events             Stream raw Codex JSONL events instead of readable progress lines.',
    '  --show-codex-warnings    Show noisy Codex plugin/analytics warnings in terminal output.',
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
    autoEscalate: true,
    parkedPivotAfter: 2,
    parkedRepeatLimit: 4,
    xhighTaskClasses: DEFAULT_XHIGH_TASK_CLASSES,
    rawEvents: false,
    showCodexWarnings: false,
    modelPolicy: 'auto',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
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
    if (arg === '--no-auto-escalate') {
      args.autoEscalate = false;
      continue;
    }
    if (arg === '--raw-events') {
      args.rawEvents = true;
      continue;
    }
    if (arg === '--show-codex-warnings') {
      args.showCodexWarnings = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--stage') args.stage = Number.parseInt(next, 10);
    else if (arg === '--mode') args.mode = next;
    else if (arg === '--corpora') args.corpora = next;
    else if (arg === '--max-iterations') args.maxIterations = Math.max(1, Math.min(5, Number.parseInt(next, 10) || 1));
    else if (arg === '--max-stages') args.maxStages = Math.max(1, Math.min(20, Number.parseInt(next, 10) || 1));
    else if (arg === '--parked-pivot-after') args.parkedPivotAfter = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--parked-repeat-limit') args.parkedRepeatLimit = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--poll-seconds') args.pollSeconds = Math.max(5, Number.parseInt(next, 10) || 30);
    else if (arg === '--objective') args.objective = next;
    else if (arg === '--prompt') args.promptTemplate = next;
    else if (arg === '--schema') args.schema = next;
    else if (arg === '--out-root') args.outRoot = next;
    else if (arg === '--model') args.model = next;
    else if (arg === '--model-policy') args.modelPolicy = parseModelPolicy(next);
    else if (arg === '--reasoning-effort') args.reasoningEffort = parseReasoningEffort(next);
    else if (arg === '--xhigh-task-classes') args.xhighTaskClasses = parseXhighTaskClasses(next).join(',');
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (!Number.isInteger(args.stage) || args.stage <= 0) throw new Error('--stage <n> is required.');
  return args;
}

function parseModelPolicy(value: string): ModelPolicy {
  if (value === 'auto' || value === 'mini' || value === 'advanced' || value === 'xhigh') return value;
  throw new Error(`Invalid --model-policy ${value}. Use auto, mini, advanced, or xhigh.`);
}

function parseReasoningEffort(value: string): ReasoningEffort {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') return value;
  throw new Error(`Invalid --reasoning-effort ${value}. Use low, medium, high, or xhigh.`);
}

function parseXhighTaskClasses(value: string): string[] {
  const classes = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!classes.length) throw new Error('--xhigh-task-classes must include at least one class.');
  const unknown = classes.filter(item => !XHIGH_TASK_PATTERNS[item]);
  if (unknown.length) {
    throw new Error(`Unknown --xhigh-task-classes value(s): ${unknown.join(', ')}. Known: ${Object.keys(XHIGH_TASK_PATTERNS).join(', ')}`);
  }
  return classes;
}

function approvedXhighTaskClass(args: RunnerArgs, decision: StageDecision | null): string | undefined {
  const haystack = [
    args.mode,
    args.objective,
    decision?.next_action ?? '',
    decision?.classification ?? '',
  ].join('\n');
  for (const taskClass of parseXhighTaskClasses(args.xhighTaskClasses)) {
    if (XHIGH_TASK_PATTERNS[taskClass]?.test(haystack)) return taskClass;
  }
  return undefined;
}

function modeNeedsAdvancedModel(mode: string): boolean {
  return /(?:hard|xhigh|deep|planning|architecture|acceptance|full[-_ ]?gate|benchmark[-_ ]?gate|release|determinism|analyzer|protected)/i
    .test(mode);
}

function selectModel(args: RunnerArgs): ModelSelection {
  if (args.model) {
    return {
      model: args.model,
      reasoningEffort: args.reasoningEffort ?? 'medium',
      policy: args.modelPolicy,
      reason: args.reasoningEffort
        ? 'explicit model and reasoning override'
        : 'explicit model override with medium reasoning',
    };
  }

  if (args.modelPolicy === 'mini') {
    return {
      model: DEFAULT_MINI_MODEL,
      reasoningEffort: args.reasoningEffort ?? 'medium',
      policy: args.modelPolicy,
      reason: 'forced conservative mini policy',
    };
  }

  if (args.modelPolicy === 'advanced') {
    return {
      model: DEFAULT_ADVANCED_MODEL,
      reasoningEffort: args.reasoningEffort ?? 'high',
      policy: args.modelPolicy,
      reason: 'forced advanced policy',
    };
  }

  if (args.modelPolicy === 'xhigh') {
    return {
      model: DEFAULT_ADVANCED_MODEL,
      reasoningEffort: args.reasoningEffort ?? 'xhigh',
      policy: args.modelPolicy,
      reason: 'forced frontier extra-high policy',
    };
  }

  if (modeNeedsAdvancedModel(args.mode)) {
    return {
      model: DEFAULT_ADVANCED_MODEL,
      reasoningEffort: args.reasoningEffort ?? 'xhigh',
      policy: args.modelPolicy,
      reason: `auto escalation for mode "${args.mode}"`,
    };
  }

  return {
    model: DEFAULT_MINI_MODEL,
    reasoningEffort: args.reasoningEffort ?? 'medium',
    policy: args.modelPolicy,
    reason: 'auto conservative default',
  };
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

function shouldSuppressCodexStderrLine(line: string, state: { suppressAnalyticsHtml: boolean }): boolean {
  if (state.suppressAnalyticsHtml) {
    if (line.includes('</html>')) state.suppressAnalyticsHtml = false;
    return true;
  }
  if (/WARN codex_core_plugins::manifest: ignoring interface\.defaultPrompt:/.test(line)) return true;
  if (/WARN codex_core::file_watcher: failed to unwatch/.test(line)) return true;
  if (/WARN codex_protocol::openai_models: Model personality requested but model_messages is missing/.test(line)) return true;
  if (/WARN codex_analytics::reducer: dropping compaction analytics event:/.test(line)) return true;
  if (/WARN codex_core::plugins::manager: failed to warm featured plugin ids cache/.test(line)) {
    state.suppressAnalyticsHtml = true;
    return true;
  }
  if (/WARN codex_analytics::client: events failed with status/.test(line)) {
    state.suppressAnalyticsHtml = true;
    return true;
  }
  return false;
}

function streamCodexStderrChunk(
  text: string,
  lineBuffer: { value: string },
  rawEvents: boolean,
  showCodexWarnings: boolean,
  state: { suppressAnalyticsHtml: boolean },
): void {
  if (rawEvents || showCodexWarnings) {
    process.stderr.write(text);
    return;
  }
  lineBuffer.value += text;
  const lines = lineBuffer.value.split(/\r?\n/);
  lineBuffer.value = lines.pop() ?? '';
  for (const line of lines) {
    if (!shouldSuppressCodexStderrLine(line, state)) process.stderr.write(`${line}\n`);
  }
}

function flushCodexStderrChunk(
  lineBuffer: { value: string },
  rawEvents: boolean,
  showCodexWarnings: boolean,
  state: { suppressAnalyticsHtml: boolean },
): void {
  if (rawEvents || showCodexWarnings) return;
  const line = lineBuffer.value;
  if (line && !shouldSuppressCodexStderrLine(line, state)) process.stderr.write(line);
  lineBuffer.value = '';
}

async function runIteration(args: RunnerArgs, iteration: number, runDir: string, modelSelection: ModelSelection): Promise<void> {
  const template = await readFile(args.promptTemplate, 'utf8');
  const prompt = renderTemplate(template, {
    STAGE: String(args.stage),
    MODE: args.mode,
    ITERATION: String(iteration),
    MAX_ITERATIONS: String(args.maxIterations),
    CORPORA: args.corpora,
    OBJECTIVE: args.objective,
    MODEL: modelSelection.model,
    MODEL_POLICY: modelSelection.policy,
    REASONING_EFFORT: modelSelection.reasoningEffort,
    MODEL_SELECTION_REASON: modelSelection.reason,
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
      modelSelection,
    }, null, 2), 'utf8');
    console.log(`Dry run wrote ${promptPath}`);
    return;
  }

  const codex = await codexPath();
  const codexArgs = [
    'exec',
    '--cd', process.cwd(),
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-schema', resolve(args.schema),
    '--output-last-message', summaryPath,
    '--json',
    '--model', modelSelection.model,
    '-c', `model_reasoning_effort="${modelSelection.reasoningEffort}"`,
  ];
  codexArgs.push('-');

  await new Promise<void>((resolveRun, reject) => {
    const proc = spawn(codex, codexArgs, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const chunks: string[] = [];
    const lineBuffer = { value: '' };
    const stderrLineBuffer = { value: '' };
    const stderrState = { suppressAnalyticsHtml: false };
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
      streamCodexStderrChunk(text, stderrLineBuffer, args.rawEvents, args.showCodexWarnings, stderrState);
    });
    proc.on('error', reject);
    proc.on('close', async code => {
      clearInterval(heartbeat);
      flushCodexChunk(lineBuffer, args.rawEvents);
      flushCodexStderrChunk(stderrLineBuffer, args.rawEvents, args.showCodexWarnings, stderrState);
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

function shouldStopContinuous(args: RunnerArgs, decision: StageDecision | null): ContinuousStop | null {
  if (!decision?.classification) {
    return {
      reason: 'missing_or_unparseable_summary',
      canEscalate: false,
      escalationRequested: false,
    };
  }
  if (decision.classification === 'blocked' || decision.classification === 'safe_to_implement') {
    const text = `${decision.next_action ?? ''}`;
    const escalationRequested = /(?:--model-policy\s+xhigh|xhigh|extra[- ]?high|gpt-5\.5)/i.test(text);
    const approvedTaskClass = escalationRequested ? approvedXhighTaskClass(args, decision) : undefined;
    return {
      reason: decision.classification,
      canEscalate: Boolean(escalationRequested && approvedTaskClass),
      escalationRequested,
      approvedTaskClass,
    };
  }
  if (decision.classification === 'rejected' || decision.classification === 'acceptance_ready') {
    return {
      reason: decision.classification,
      canEscalate: false,
      escalationRequested: false,
    };
  }
  return null;
}

function escalationArgs(args: RunnerArgs): RunnerArgs {
  return {
    ...args,
    mode: modeNeedsAdvancedModel(args.mode) ? args.mode : `${args.mode}-xhigh`,
    modelPolicy: 'xhigh',
    reasoningEffort: 'xhigh',
  };
}

function canAutoEscalate(args: RunnerArgs, stop: ContinuousStop, alreadyEscalated: boolean): boolean {
  if (!args.continuous || !args.autoEscalate || alreadyEscalated || !stop.canEscalate) return false;
  if (args.modelPolicy === 'xhigh' || args.reasoningEffort === 'xhigh') return false;
  return true;
}

function topicFromText(text: string): string {
  const topic = earliestTopic(text, [
    ['runtime-tail', /runtime[-_ ]tail|runtime|p95|wall[-_ ]?time/i],
    ['protected-parity', /protected[-_ ](?:parity|baseline)/i],
    ['visual-stability', /visual[-_ ]stability|visual gate|pixel drift|render comparison/i],
    ['font-text-extractability', /font[-/ ]text|text[-_ ]extractability/i],
    ['analyzer-volatility', /analyzer[-_ ]volatility|same-buffer/i],
    ['protected-parity', /protected|parity/i],
    ['visual-stability', /visual|render|pixel|drift/i],
    ['font-text-extractability', /font|text extract/i],
    ['analyzer-volatility', /analyzer|analysis|volatility/i],
    ['boundary', /boundary/i],
    ['figure-alt', /figure[-_\/ ]?alt|figure|alt/i],
    ['table', /table/i],
    ['heading', /heading/i],
  ]);
  if (topic) return topic;
  return 'unspecified';
}

function earliestTopic(text: string, patterns: Array<[string, RegExp]>): string | null {
  let best: { topic: string; index: number } | null = null;
  for (const [topic, pattern] of patterns) {
    const match = pattern.exec(text);
    if (!match || match.index < 0) continue;
    if (!best || match.index < best.index) best = { topic, index: match.index };
  }
  return best?.topic ?? null;
}

function parkedTopic(decision: StageDecision | null): string | null {
  if (decision?.classification !== 'diagnostic_only') return null;
  const text = `${decision.summary ?? ''}\n${decision.next_action ?? ''}`;
  if (!/(?:\bpark(?:ed)?\b|pivot away from|select a different (?:stable )?residual family|no material improvement|no further implementation|no implementation (?:is )?justified|no (?:remediation )?behavior change (?:was )?justified|no remediation change was kept|do not promote .*acceptance-ready|stop rather than reiterat|keep .* parked)/i.test(text)) return null;
  return topicFromText(text);
}

function softPivotBlockedTopic(decision: StageDecision | null): string | null {
  if (decision?.classification !== 'blocked') return null;
  const text = `${decision.summary ?? ''}\n${decision.next_action ?? ''}`;
  if (!/(?:pivot to a different residual (?:family|branch)|pivot to another (?:target|residual) family|select a different (?:stable )?residual family|pivot away from|\bpark(?:ed)?\b|leave .* parked|wait for a fresh row|no repeatable .* rule was proven|no .* evidence-backed .* rule|did not justify (?:changing|a code change|any code change)|no safe .* behavior change|no safe .* change)/i.test(text)) return null;
  return topicFromText(text);
}

function pivotObjective(baseObjective: string, topic: string, count: number): string {
  return [
    baseObjective,
    `Pivot directive: the last ${count} diagnostic-only stage(s) kept the ${topic} topic parked.`,
    `Do not spend this stage reaffirming ${topic} unless genuinely new evidence is available.`,
    'Select a different residual family or benchmark/acceptance risk from the latest artifacts, such as runtime tail, protected parity, font/text extractability, figure/alt, table, heading, analyzer determinism, or visual stability.',
    'If no safe alternate target exists, return blocked with a concise reason instead of writing another parking note.',
  ].join(' ');
}

async function runStage(args: RunnerArgs): Promise<{ runDir: string; decision: StageDecision | null }> {
  const runDir = resolve(args.outRoot, `stage${args.stage}-${stamp()}-${sha1(JSON.stringify(args)).slice(0, 8)}`);
  await mkdir(runDir, { recursive: true });
  const modelSelection = selectModel(args);

  const dirty = await trackedDirty();
  if (dirty && !args.allowDirty) {
    throw new Error(`Tracked worktree changes exist. Commit/stash them or pass --allow-dirty.\n${dirty}`);
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    args,
    modelSelection,
    cwd: process.cwd(),
    codex: args.dryRun ? null : await codexPath(),
    llmStatus: await llmStatus(),
  };
  await writeFile(join(runDir, 'run-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

  console.log('');
  console.log(`=== Stage ${args.stage} (${args.mode}) ===`);
  console.log(`Agent run dir: ${runDir}`);
  console.log(`Corpora: ${args.corpora}`);
  console.log(`Model: ${modelSelection.model} (${modelSelection.reasoningEffort}, ${modelSelection.reason})`);
  for (let i = 1; i <= args.maxIterations; i += 1) {
    console.log(`--- Iteration ${i}/${args.maxIterations} ---`);
    await runIteration(args, i, runDir, modelSelection);
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
  let consecutiveParkedTopic: string | null = null;
  let consecutiveParkedCount = 0;
  let pivotTopicForNext: { topic: string; count: number } | null = null;
  for (let offset = 0; offset < stageCount; offset += 1) {
    let stageArgs = { ...args, stage: args.stage + offset };
    if (pivotTopicForNext) {
      stageArgs = {
        ...stageArgs,
        objective: pivotObjective(stageArgs.objective, pivotTopicForNext.topic, pivotTopicForNext.count),
      };
      console.log(`Applying pivot directive for stage ${stageArgs.stage}: avoid repeating parked ${pivotTopicForNext.topic} diagnostics.`);
      pivotTopicForNext = null;
    }
    let alreadyEscalated = false;
    let { decision } = await runStage(stageArgs);
    let stop = shouldStopContinuous(stageArgs, decision);
    if (stop && canAutoEscalate(stageArgs, stop, alreadyEscalated)) {
      const nextAction = decision?.next_action ? ` Next action was: ${decision.next_action}` : '';
      console.log(`Auto-escalating stage ${stageArgs.stage} once with --model-policy xhigh for ${stop.approvedTaskClass} after ${stop.reason}.${nextAction}`);
      stageArgs = escalationArgs(stageArgs);
      alreadyEscalated = true;
      ({ decision } = await runStage(stageArgs));
      stop = shouldStopContinuous(stageArgs, decision);
    }
    if (!args.continuous) break;
    const softPivotTopic = softPivotBlockedTopic(decision);
    if (stop?.reason === 'blocked' && softPivotTopic) {
      pivotTopicForNext = { topic: softPivotTopic, count: 1 };
      console.log(`Continuing after soft blocked stage ${stageArgs.stage}; next stage will pivot away from ${softPivotTopic}.`);
      stop = null;
    }
    const topic = parkedTopic(decision);
    if (topic) {
      consecutiveParkedCount = topic === consecutiveParkedTopic ? consecutiveParkedCount + 1 : 1;
      consecutiveParkedTopic = topic;
      if (args.parkedRepeatLimit > 0 && consecutiveParkedCount >= args.parkedRepeatLimit) {
        console.log(`Stopping continuous run after stage ${stageArgs.stage}: parked_repeat:${topic}`);
        console.log(`The last ${consecutiveParkedCount} diagnostic-only stage(s) kept ${topic} parked. Pivot to another target family or gather new evidence before resuming this topic.`);
        break;
      }
      if (args.parkedPivotAfter > 0 && consecutiveParkedCount >= args.parkedPivotAfter) {
        pivotTopicForNext = { topic, count: consecutiveParkedCount };
        console.log(`Next stage will receive a pivot directive away from parked ${topic} diagnostics.`);
      }
    } else {
      consecutiveParkedTopic = null;
      consecutiveParkedCount = 0;
    }
    if (stop) {
      if (stop.escalationRequested && !stop.approvedTaskClass) {
        console.log(`Xhigh was requested, but auto-escalation was not approved by --xhigh-task-classes (${stageArgs.xhighTaskClasses}).`);
      }
      console.log(`Stopping continuous run after stage ${stageArgs.stage}: ${stop.reason}`);
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
