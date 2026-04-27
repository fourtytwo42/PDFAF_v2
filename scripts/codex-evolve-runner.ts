#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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
  parkedPivotAfter: number;
  parkedRepeatLimit: number;
  topicCooldownStages: number;
  targetFamilies: string;
  corpora: string;
  outRoot: string;
  dryRun: boolean;
  allowDirty: boolean;
  pullV1WhenNeeded: boolean;
  visualGate: boolean;
  protectedBaselineRun?: string;
  xhighTaskClasses: string;
  extraObjective: string;
  corpusLoop: boolean;
  discoveryHoldoutSize: number;
  plateauAfterBatches: number;
  v1SourceRoot: string;
  discoveryHoldoutRoot: string;
}

interface StageSummary {
  stage?: number;
  classification?: string;
  summary?: string;
  next_action?: string;
}

interface StageSummaryWithSource extends StageSummary {
  runDir: string;
}

interface TargetSelection {
  selectedFamily: string;
  selectedLabel: string;
  selectedObjective: string;
  cooledTopics: string[];
  recentCooldownTopics: string[];
}

interface CorpusEvolutionState {
  policy: 'corpus_loop' | 'disabled';
  legacyBaselineRun?: string;
  knownHoldoutManifests: string[];
  latestLegacyRuns: string[];
  latestHoldoutRuns: string[];
  discoveryHoldoutRoot: string;
  v1SourceRoot: string;
  discoveryHoldoutSize: number;
  plateauAfterBatches: number;
}

interface ProtectedBaselinePreflight {
  requestedPath?: string;
  effectivePath?: string;
  status: 'not_requested' | 'ready' | 'missing';
  detail: string;
}

const DEFAULT_OUT_ROOT = 'Output/agent-runs';
const DEFAULT_XHIGH_TASK_CLASSES = 'hard-planning,boundary-policy,full-gate,protected,analyzer,determinism,architecture,release,acceptance';
const DEFAULT_TARGET_FAMILIES = 'corpus-generalization,figure-alt,table,heading,font-text-extractability,protected-parity,runtime-tail,visual-stability,analyzer-volatility,boundary';

const TARGET_FAMILIES: Record<string, { label: string; objective: string }> = {
  'corpus-generalization': {
    label: 'corpus generalization',
    objective: 'Prioritize the corpus-evolution loop: measure the current engine on the legacy protected corpus and the active v1 holdout, classify stable residual families, implement one narrow general improvement only if evidence supports it, then validate against both the holdout and the legacy protected corpus. When the active holdout has plateaued, select or build the next small v1-derived holdout batch before more fixer work.',
  },
  'runtime-tail': {
    label: 'runtime tail',
    objective: 'Prioritize runtime-tail evidence and speed-preserving remediation. Inspect p95/runtime artifacts and repeated no-gain expensive paths first; if fresh artifacts are missing, generate a small no-semantic target runtime sample on known tail rows before blocking. Do not trade quality or protected-floor preservation for speed.',
  },
  'protected-parity': {
    label: 'protected parity',
    objective: 'Prioritize protected-baseline parity and protected regression evidence. Focus on deterministic protected-floor preservation, not new broad route guards.',
  },
  'visual-stability': {
    label: 'visual stability',
    objective: 'Prioritize reusable visual stability validation for remediation changes. Build or improve before/after render comparison checks before changing PDF mutation behavior.',
  },
  'font-text-extractability': {
    label: 'font/text extractability',
    objective: 'Prioritize font and text-extractability residuals. Preserve Stage 75 font gains, text count, embedded font evidence, ToUnicode coverage, and archival safety.',
  },
  'figure-alt': {
    label: 'figure/alt recovery',
    objective: 'Prioritize stable figure/alt residuals with checker-visible evidence. Avoid parked analyzer-volatility rows and do not introduce broad figure route guards.',
  },
  table: {
    label: 'table recovery',
    objective: 'Prioritize stable table residuals with invariant-backed table markup evidence. Avoid retries without checker-facing table improvement.',
  },
  heading: {
    label: 'heading recovery',
    objective: 'Prioritize stable heading residuals only when candidate evidence exists. Avoid broad heading scheduler expansion without root-reachable evidence.',
  },
  'analyzer-volatility': {
    label: 'analyzer volatility',
    objective: 'Prioritize analyzer determinism only when raw-repeat evidence proves a quality-preserving deterministic rule. Do not stabilize by dropping valid structural evidence.',
  },
  boundary: {
    label: 'boundary policy',
    objective: 'Prioritize boundary subtype work only with fresh repeat-preserving evidence. Do not reaffirm parked boundary decisions or promote contentless boundary evidence.',
  },
};

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
    '  --no-corpus-loop               Disable the default v1 holdout discovery -> fix -> legacy validation policy.',
    '  --discovery-holdout-size <n>   Default: 30. Target row count for newly selected v1 holdout batches.',
    '  --plateau-after-batches <n>    Default: 2. Pull/select a new holdout after this many no-material-progress batches.',
    '  --v1-source-root <dir>         Default: /home/hendo420/pdfaf.',
    '  --discovery-holdout-root <dir> Default: Input/from_sibling_pdfaf_v1_evolve.',
    '  --max-iterations <n>           Default: 1.',
    '  --poll-seconds <n>             Default: 30.',
    '  --parked-pivot-after <n>       Default: 2. Encourages a pivot after repeated parked diagnostics for one topic.',
    '  --parked-repeat-limit <n>      Default: 4. Stops a batch if pivoting still repeats parked diagnostics.',
    '  --topic-cooldown-stages <n>    Default: 8. Avoids recently parked topics for this many stages.',
    `  --target-families <csv>         Default: ${DEFAULT_TARGET_FAMILIES}`,
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
    parkedPivotAfter: 2,
    parkedRepeatLimit: 4,
    topicCooldownStages: 8,
    targetFamilies: DEFAULT_TARGET_FAMILIES,
    corpora: 'legacy,v1-edge',
    outRoot: DEFAULT_OUT_ROOT,
    dryRun: false,
    allowDirty: false,
    pullV1WhenNeeded: false,
    visualGate: false,
    xhighTaskClasses: DEFAULT_XHIGH_TASK_CLASSES,
    extraObjective: '',
    corpusLoop: true,
    discoveryHoldoutSize: 30,
    plateauAfterBatches: 2,
    v1SourceRoot: '/home/hendo420/pdfaf',
    discoveryHoldoutRoot: 'Input/from_sibling_pdfaf_v1_evolve',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
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
    if (arg === '--no-corpus-loop') {
      args.corpusLoop = false;
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
    else if (arg === '--parked-pivot-after') args.parkedPivotAfter = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--parked-repeat-limit') args.parkedRepeatLimit = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--topic-cooldown-stages') args.topicCooldownStages = Math.max(0, Number.parseInt(next, 10) || 0);
    else if (arg === '--target-families') args.targetFamilies = parseTargetFamilies(next).join(',');
    else if (arg === '--mode') args.mode = next;
    else if (arg === '--corpora') args.corpora = next;
    else if (arg === '--out-root') args.outRoot = next;
    else if (arg === '--protected-baseline-run') args.protectedBaselineRun = next;
    else if (arg === '--xhigh-task-classes') args.xhighTaskClasses = next;
    else if (arg === '--objective') args.extraObjective = next;
    else if (arg === '--discovery-holdout-size') args.discoveryHoldoutSize = Math.max(5, Math.min(60, positiveInt(next, arg)));
    else if (arg === '--plateau-after-batches') args.plateauAfterBatches = Math.max(1, positiveInt(next, arg));
    else if (arg === '--v1-source-root') args.v1SourceRoot = next;
    else if (arg === '--discovery-holdout-root') args.discoveryHoldoutRoot = next;
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

function parseTargetFamilies(value: string): string[] {
  const families = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!families.length) throw new Error('--target-families must include at least one family.');
  const unknown = families.filter(item => !TARGET_FAMILIES[item]);
  if (unknown.length) {
    throw new Error(`Unknown --target-families value(s): ${unknown.join(', ')}. Known: ${Object.keys(TARGET_FAMILIES).join(', ')}`);
  }
  return families;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function protectedBaselineReady(path: string): Promise<boolean> {
  const resolved = resolve(path);
  const requiredFiles = [
    'manifest.snapshot.json',
    'analyze.results.json',
    'remediate.results.json',
    'summary.json',
  ];
  for (const file of requiredFiles) {
    if (!await pathExists(join(resolved, file))) return false;
  }
  return true;
}

async function applyProtectedBaselinePreflight(args: EvolveArgs): Promise<ProtectedBaselinePreflight> {
  if (!args.protectedBaselineRun) {
    return {
      status: 'not_requested',
      detail: 'No protected baseline run was requested.',
    };
  }

  const requestedPath = args.protectedBaselineRun;
  if (await protectedBaselineReady(requestedPath)) {
    args.protectedBaselineRun = resolve(requestedPath);
    return {
      requestedPath,
      effectivePath: args.protectedBaselineRun,
      status: 'ready',
      detail: `Protected baseline run is available at ${args.protectedBaselineRun}.`,
    };
  }

  args.protectedBaselineRun = undefined;
  const warning = [
    `Protected baseline run was requested but is missing or incomplete: ${requestedPath}.`,
    'Do not attempt protected/full-gate acceptance work in this batch.',
    'Rebuild or restore the baseline before protected-baseline comparisons.',
  ].join(' ');
  args.extraObjective = [args.extraObjective.trim(), warning].filter(Boolean).join(' ');
  return {
    requestedPath,
    status: 'missing',
    detail: warning,
  };
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

async function listMatchingDirs(root: string, pattern: RegExp, limit: number): Promise<string[]> {
  try {
    const names = await readdir(root);
    const rows: Array<{ name: string; mtimeMs: number }> = [];
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const full = join(root, name);
      try {
        const info = await stat(full);
        if (info.isDirectory()) rows.push({ name: full, mtimeMs: info.mtimeMs });
      } catch {
        // Best-effort corpus state only.
      }
    }
    return rows
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map(row => row.name);
  } catch {
    return [];
  }
}

async function discoverHoldoutManifests(): Promise<string[]> {
  const inputDirs = await listMatchingDirs('Input', /^from_sibling_pdfaf_v1/, 20);
  const manifests: string[] = [];
  for (const dir of inputDirs) {
    const manifest = join(dir, 'manifest.json');
    if (await pathExists(manifest)) manifests.push(manifest);
  }
  return manifests;
}

async function discoverLatestHoldoutRuns(limit = 12): Promise<string[]> {
  const outputDirs = await listMatchingDirs('Output', /^from_sibling_pdfaf_v1/, 20);
  const runs: Array<{ name: string; mtimeMs: number }> = [];
  for (const dir of outputDirs) {
    for (const run of await listMatchingDirs(dir, /^run-stage\d+/, limit)) {
      try {
        const info = await stat(run);
        runs.push({ name: run, mtimeMs: info.mtimeMs });
      } catch {
        // Best-effort corpus state only.
      }
    }
  }
  return runs
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(run => run.name);
}

async function discoverCorpusEvolutionState(args: EvolveArgs, protectedBaseline: ProtectedBaselinePreflight): Promise<CorpusEvolutionState> {
  return {
    policy: args.corpusLoop ? 'corpus_loop' : 'disabled',
    legacyBaselineRun: protectedBaseline.effectivePath,
    knownHoldoutManifests: args.corpusLoop ? await discoverHoldoutManifests() : [],
    latestLegacyRuns: args.corpusLoop
      ? await listMatchingDirs('Output/experiment-corpus-baseline', /^run-stage\d+.*(?:full|legacy|current)/, 8)
      : [],
    latestHoldoutRuns: args.corpusLoop
      ? await discoverLatestHoldoutRuns(12)
      : [],
    discoveryHoldoutRoot: args.discoveryHoldoutRoot,
    v1SourceRoot: args.v1SourceRoot,
    discoveryHoldoutSize: args.discoveryHoldoutSize,
    plateauAfterBatches: args.plateauAfterBatches,
  };
}

function renderPlateauDefinition(): string {
  return [
    'Plateau definition:',
    'A stage may declare plateau only when all of these are true:',
    'A. Active holdout and legacy protected baseline metrics are known or were intentionally refreshed/inspected.',
    'B. Every non-manual residual row is classified as stable fixer candidate, analyzer volatility, protected parity debt, runtime tail, manual/OCR policy debt, already-good control, no-safe-candidate, or stable-engine-gain-below-target.',
    'C. All stable fixer candidates in the selected family have either produced a safe implemented rule, or have bounded repeat/target evidence proving no safe general rule right now.',
    'D. No bounded next diagnostic remains that could decide an implementation/rejection inside the current stage.',
    'E. Prior named wins remain checked or explicitly scoped as unaffected: Stage 75 font gains, Stage 127/129/131 holdout gains, false-positive applied = 0, protected rows, runtime p95, page/text/tag/link stability, and visual stability for changed PDFs.',
    'F. The next action is a real pivot: a different residual family, a fresh v1 holdout, analyzer-determinism project, runtime project, or a human acceptance decision.',
    'If any criterion is missing and the needed evidence is locally bounded, continue the stage work instead of returning diagnostic_only.',
  ].join(' ');
}

function renderCorpusEvolutionState(state: CorpusEvolutionState): string {
  if (state.policy === 'disabled') return 'Corpus evolution loop: disabled for this run.';
  return [
    'Corpus evolution loop: enabled.',
    `Legacy protected baseline: ${state.legacyBaselineRun ?? 'not available; do not run formal protected acceptance until restored'}.`,
    `Known v1 holdout manifests: ${state.knownHoldoutManifests.length ? state.knownHoldoutManifests.join(', ') : 'none found'}.`,
    `Recent legacy runs: ${state.latestLegacyRuns.length ? state.latestLegacyRuns.join(', ') : 'none found'}.`,
    `Recent holdout runs: ${state.latestHoldoutRuns.length ? state.latestHoldoutRuns.join(', ') : 'none found'}.`,
    `New holdout target: ${state.discoveryHoldoutSize} rows under ${state.discoveryHoldoutRoot} from ${state.v1SourceRoot}.`,
    `Plateau policy: after ${state.plateauAfterBatches} no-material-progress batch(es), pivot to selecting a fresh v1 holdout or a different stable residual family.`,
  ].join(' ');
}

function renderStageChecklist(): string {
  return [
    'Per-stage checklist:',
    '1. Preflight: inspect git state, disk, existing LLM/listeners, protected baseline availability, active holdout manifest, and latest legacy/holdout artifacts.',
    '2. Baseline: run or inspect current legacy 50 and active v1 holdout results; record mean, median, F count, A/B rate, p95 runtime, attempts, false-positive applied, protected regressions, and named prior wins.',
    '3. Classify: bucket residual rows as stable fixer candidate, analyzer volatility, manual/OCR policy debt, runtime tail, protected parity debt, or already-good control.',
    '4. Select: pick one stable general target family; if no stable family remains, declare plateau and select/build a fresh v1 holdout rather than forcing a fixer.',
    '5. Diagnose: run the smallest target sample with controls and collect tool timelines, category deltas, analyzer evidence, link/font/text/page/tag signals, and visual-risk indicators.',
    '6. Repeat before stopping: if stable candidates exist and the missing evidence is bounded repeat/target validation, run that repeat diagnostic in this same stage before returning diagnostic_only or blocked. Do not advance the stage just because repeat evidence is missing.',
    '7. Plateau gate: before returning diagnostic_only, prove the plateau definition is satisfied; otherwise continue diagnostics, implement, reject, or return blocked with the specific unbounded blocker.',
    '8. Decide: implement only when the diagnostic proves a safe general rule; otherwise write a diagnostic report, park the debt, and pivot/stop.',
    '9. Implement: make one narrow criterion-driven engine change with focused tests; never use publication-id, filename, corpus-label, scorer/gate semantic changes, or broad route guards unless explicitly authorized by evidence.',
    '10. Focused validate: run static/unit tests, target rows, controls, and visual diff for changed PDFs or visual-risk mutations.',
    '11. Holdout validate: run the active v1 holdout or the justified target subset; require target improvement or clear debt classification, false-positive applied = 0, bounded runtime, and preservation of previous holdout wins.',
    '12. Legacy validate: for behavior changes, run legacy protected validation and Stage 41 gate when feasible; require protected non-regression, F count/runtime/mean/median within envelope, and preservation of Stage 75/127/129/131 wins.',
    '13. Commit or reject: commit and push source/docs/tests only when clean; otherwise tighten or revert. Generated PDFs, benchmark artifacts, copied corpora, and Base64 stay local.',
    '14. Summarize: record what changed, evidence, commands, artifacts, pass/fail gates, plateau status, remaining debt, and the next stage recommendation.',
  ].join(' ');
}

function buildObjective(args: EvolveArgs, stage: number, target: TargetSelection, corpusState: CorpusEvolutionState): string {
  const parts = [
    'Evolve PDFAF Engine v2 over bounded stages. Improve general PDF accessibility remediation while preserving processing speed, avoiding regressions, and keeping rendered PDFs visually unchanged.',
    'Prefer evidence-first diagnostics, then narrow general implementation only when a safe rule is proven.',
    'Every accepted behavior change must protect false-positive applied = 0, protected rows, F count, runtime p95, text extraction, structure/tag state, page count, and visual stability.',
    'Reject or revert candidates that overfit, broaden route guards without evidence, change scorer/gate semantics, or alter visible rendering.',
    'Default operating loop: establish the current baseline on the legacy protected corpus and active v1 holdout; classify stable residual failures; implement one narrow general improvement; validate against both the discovery holdout and the legacy protected corpus; repeat until that holdout plateaus, then select a fresh v1-derived holdout batch.',
    'Do not consider a stage complete just because it produced a diagnostic. A stage is complete only when it lands a safe engine improvement, rejects a tested unsafe candidate, or satisfies the plateau definition below.',
    renderPlateauDefinition(),
    'Treat v1-derived holdouts as discovery/generalization corpora, not release gates. The legacy protected corpus remains the regression gate for protected parity, speed, F count, and prior wins.',
    'When pulling a new v1 batch, prefer original/source PDFs, exclude all prior manifests and debug targets, stratify by failure family, cap runtime/size risk, keep files/artifacts local, and never commit PDFs/Base64/generated benchmark payloads.',
    'Do not build fixers on analyzer-volatility, manual/scanned policy debt, or rows without a stable safe candidate. Park those explicitly and pivot to stable residuals or a new holdout.',
    'For any behavior change, require target holdout improvement, legacy protected non-regression, false-positive applied = 0, runtime within envelope, previous named wins preserved, and visual stability for changed PDFs.',
    'Do not stop at "needs repeat evidence" when the required repeat is bounded to known stable candidates; run the repeat/target diagnostic inside the current stage and only then classify, implement, park, or block.',
    renderStageChecklist(),
    'Do not spend repeated stages reaffirming one parked topic. If a family is parked with no implementation justified, pivot to a different residual family or stop with a clear blocked decision.',
    'If the selected target family lacks fresh artifacts, create the smallest focused diagnostic or benchmark sample needed for that family before returning blocked. Do not block solely because old artifacts were cleaned up.',
    `Target-family directive: prioritize ${target.selectedLabel}. ${target.selectedObjective}`,
    renderCorpusEvolutionState(corpusState),
    target.cooledTopics.length
      ? `Cooldown directive: avoid these recently parked topics unless genuinely new evidence appears: ${target.cooledTopics.join(', ')}.`
      : 'Cooldown directive: no recently parked topics are currently excluded.',
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

function stageArgs(args: EvolveArgs, stage: number, target: TargetSelection, corpusState: CorpusEvolutionState): string[] {
  const out = [
    '--continuous',
    '--stage', String(stage),
    '--max-stages', String(args.batchSize),
    '--max-iterations', String(args.maxIterations),
    '--poll-seconds', String(args.pollSeconds),
    '--parked-pivot-after', String(args.parkedPivotAfter),
    '--parked-repeat-limit', String(args.parkedRepeatLimit),
    '--mode', args.mode,
    '--corpora', args.corpora,
    '--out-root', args.outRoot,
    '--xhigh-task-classes', args.xhighTaskClasses,
    '--objective', buildObjective(args, stage, target, corpusState),
  ];
  if (args.allowDirty) out.push('--allow-dirty');
  if (args.dryRun) out.push('--dry-run');
  return out;
}

async function runStageBatch(args: EvolveArgs, stage: number, target: TargetSelection, corpusState: CorpusEvolutionState): Promise<number> {
  const childArgs = stageArgs(args, stage, target, corpusState);
  console.log('');
  console.log(`=== Evolve batch starting at Stage ${stage}; batch size ${args.batchSize} ===`);
  console.log(`Target family: ${target.selectedFamily} (${target.selectedLabel})`);
  console.log(`Corpus loop: ${corpusState.policy}`);
  if (corpusState.policy === 'corpus_loop') {
    console.log(`Known holdout manifests: ${corpusState.knownHoldoutManifests.length}`);
    console.log(`Discovery holdout root: ${corpusState.discoveryHoldoutRoot}`);
  }
  if (target.cooledTopics.length) console.log(`Cooldown topics: ${target.cooledTopics.join(', ')}`);
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

async function readLatestSummaries(outRoot: string, limit = 8): Promise<StageSummaryWithSource[]> {
  let dirs: Array<{ name: string; stage: number }> = [];
  try {
    dirs = (await readdir(outRoot))
      .map(name => {
        const stage = /^stage(\d+)-/.exec(name)?.[1];
        return stage ? { name, stage: Number.parseInt(stage, 10) } : null;
      })
      .filter((entry): entry is { name: string; stage: number } => Boolean(entry) && Number.isInteger(entry.stage))
      .sort((a, b) => a.stage - b.stage || a.name.localeCompare(b.name))
      .slice(-limit);
  } catch {
    return [];
  }

  const summaries: StageSummaryWithSource[] = [];
  for (const dir of dirs) {
    try {
      const files = (await readdir(join(outRoot, dir.name))).filter(name => /^iteration-\d+-summary\.json$/.test(name)).sort();
      const file = files.at(-1);
      if (!file) continue;
      summaries.push({
        ...(JSON.parse(await readFile(join(outRoot, dir.name, file), 'utf8')) as StageSummary),
        runDir: dir.name,
      });
    } catch {
      // Keep evolve status best-effort; worker artifacts remain on disk.
    }
  }
  return summaries;
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

function cooldownTopic(summary: StageSummary): string | null {
  const text = `${summary.summary ?? ''}\n${summary.next_action ?? ''}`;
  if (summary.classification === 'diagnostic_only'
    && /(?:\bpark(?:ed)?\b|pivot away from|select a different (?:stable )?residual family|no material improvement|no further implementation|no implementation (?:is )?justified|no (?:remediation )?behavior change (?:was )?justified|no remediation change was kept|do not promote .*acceptance-ready|stop rather than reiterat|keep .* parked)/i.test(text)) {
    return topicFromText(text);
  }
  if (summary.classification === 'blocked'
    && /(?:pivot to a different residual (?:family|branch)|pivot to another (?:target|residual) family|select a different (?:stable )?residual family|pivot away from|\bpark(?:ed)?\b|leave .* parked|wait for a fresh row|no repeatable .* rule was proven|no .* evidence-backed .* rule|did not justify (?:changing|a code change|any code change)|no safe .* behavior change|no safe .* change)/i.test(text)) {
    return topicFromText(text);
  }
  return null;
}

function selectTargetFamily(args: EvolveArgs, summaries: StageSummary[]): TargetSelection {
  const latestStage = Math.max(0, ...summaries.map(summary => summary.stage ?? 0));
  const recentCooldownTopics = summaries
    .filter(summary => args.topicCooldownStages === 0 || (summary.stage ?? 0) >= latestStage - args.topicCooldownStages)
    .map(cooldownTopic)
    .filter((topic): topic is string => Boolean(topic));
  const cooledTopics = [...new Set(recentCooldownTopics)];
  const families = parseTargetFamilies(args.targetFamilies);
  const selectedFamily = families.find(family => !cooledTopics.includes(family)) ?? families[0]!;
  const target = TARGET_FAMILIES[selectedFamily]!;
  return {
    selectedFamily,
    selectedLabel: target.label,
    selectedObjective: target.objective,
    cooledTopics,
    recentCooldownTopics,
  };
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
  const protectedBaselinePreflight = await applyProtectedBaselinePreflight(args);

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
  console.log(`Protected baseline: ${protectedBaselinePreflight.status} - ${protectedBaselinePreflight.detail}`);
  console.log(`Disk:\n${await diskStatus()}`);
  console.log(`LLM status:\n${await llmStatus()}`);

  for (let batch = 1; batch <= maxBatches; batch += 1) {
    const startedAt = new Date().toISOString();
    const previousSummaries = await readLatestSummaries(args.outRoot, 16);
    const targetSelection = selectTargetFamily(args, previousSummaries);
    const corpusEvolutionState = await discoverCorpusEvolutionState(args, protectedBaselinePreflight);
    console.log(`Corpus state: ${renderCorpusEvolutionState(corpusEvolutionState)}`);
    const nextStage = await runStageBatch(args, stage, targetSelection, corpusEvolutionState);
    const summaries = await readLatestSummaries(args.outRoot);
    await writeState(statePath, {
      updatedAt: new Date().toISOString(),
      lastBatch: batch,
      batchStartedAt: startedAt,
      previousStage: stage,
      nextStage,
      args,
      protectedBaselinePreflight,
      corpusEvolutionState,
      targetSelection,
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
