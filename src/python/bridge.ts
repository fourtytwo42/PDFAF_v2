import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  PYTHON_TIMEOUT_MS,
  PYTHON_SCRIPT_PATH,
  PYTHON_MUTATION_TIMEOUT_MS,
  OCR_MUTATION_TIMEOUT_MS,
  SEMANTIC_MCID_MAX_PAGES,
} from '../config.js';
import type { PythonAnalysisResult, PythonMutationInvariantPayload, PythonStructuralBenefitPayload } from '../types.js';

export interface PythonMutation {
  op: string;
  params: Record<string, unknown>;
}

export interface BatchMutationResult {
  success: boolean;
  applied: string[];
  failed: Array<{ op: string; error: string }>;
  opResults?: Array<{
    op: string;
    outcome: 'applied' | 'no_effect' | 'failed';
    note?: string;
    error?: string;
    invariants?: PythonMutationInvariantPayload;
    structuralBenefits?: PythonStructuralBenefitPayload;
    debug?: {
      hasStructTreeRoot?: boolean;
      parentTreeEntries?: number;
      parentTreeNextKey?: number;
      headingCount?: number;
      structureDepth?: number;
      rootReachableDepth?: number;
      rootReachableHeadingCount?: number;
      globalHeadingCount?: number;
      globalH1Count?: number;
      rootChildrenCount?: number;
      pageStructParentsCount?: number;
      pageParentTreeArrayCount?: number;
      pageParentTreeNonEmptyCount?: number;
      topLevelNonEmptyCount?: number;
      usesMcrKidsCount?: number;
      usesIntegerKidsCount?: number;
      /** Depth computed by running qpdf --json, identical to ICJIA's calculateTreeDepth(). -1 = unavailable. */
      qpdfVerifiedDepth?: number;
      [key: string]: unknown;
    };
  }>;
}

// Empty result returned on timeout or script failure.
// Allows pdfjs data to still produce a partial score.
const EMPTY_RESULT: PythonAnalysisResult = {
  isTagged:      false,
  markInfo:      null,
  viewerPreferences: { displayDocTitle: null },
  lang:          null,
  pdfUaVersion:  null,
  headings:      [],
  figures:       [],
  checkerFigureTargets: [],
  tables:        [],
  fonts:         [],
  bookmarks:     [],
  formFields:    [],
  structureTree: null,
  paragraphStructElems: [],
  threeCcGoldenV1: false,
  threeCcGoldenOrphanV1: false,
  orphanMcids: [],
  mcidTextSpans: [],
  nativeTitleBtCandidates: [],
  acrobatStyleAltRisks: {
    nonFigureWithAltCount: 0,
    emptyNonFigureAltActualCount: 0,
    nestedFigureAltCount: 0,
    orphanedAltEmptyElementCount: 0,
    sampleOwnershipModes: [],
  },
  annotationAccessibility: {
    pagesMissingTabsS: 0,
    pagesAnnotationOrderDiffers: 0,
    linkAnnotationsMissingStructure: 0,
    nonLinkAnnotationsMissingStructure: 0,
    nonLinkAnnotationsMissingContents: 0,
    linkAnnotationsMissingStructParent: 0,
    nonLinkAnnotationsMissingStructParent: 0,
  },
  linkScoringRows: [],
  parentTreeAudit: {
    missingParentTree: false,
    pagesMissingStructParents: 0,
    missingMcidParentTreeEntries: 0,
    invalidParentTreeEntries: 0,
    annotationReferenceMismatchCount: 0,
    objectReferenceMismatchCount: 0,
  },
  contentTaggingAudit: {
    pageStreamsChecked: 0,
    totalPageStreams: 0,
    contentSampleStrategy: 'first',
    sampledPageIndices: [],
    formXObjectsChecked: 0,
    totalFormXObjects: 0,
    formXObjectParseErrorCount: 0,
    formXObjectSampleLimitHitCount: 0,
    textOutsideMarkedContentOrArtifact: 0,
    imageOutsideMarkedContentOrArtifact: 0,
    pathOutsideMarkedContentOrArtifact: 0,
    artifactInsideTaggedContent: 0,
    taggedContentInsideArtifact: 0,
    malformedMarkedContentStack: 0,
    contentOutsidePageBounds: 0,
  },
  tableHeaderAudit: {
    tablesChecked: 0,
    headerAssociationMissingCount: 0,
    orphanHeaderCellCount: 0,
    dataCellsWithoutHeaderCount: 0,
    headerCellsWithScopeCount: 0,
    headerCellsWithIdCount: 0,
    dataCellsWithHeadersCount: 0,
  },
  fontSyntaxAudit: {
    fontsChecked: 0,
    missingToUnicodeCMapCount: 0,
    invalidToUnicodeCMapCount: 0,
    emptyToUnicodeCMapCount: 0,
    cidToGidMapRiskCount: 0,
    trueTypeEncodingMismatchCount: 0,
    wModeMismatchCount: 0,
    externalCMapReferenceCount: 0,
    type0DescendantFontRiskCount: 0,
    replacementCharacterCount: 0,
    replacementCharacterRatio: 0,
    highReplacementCharacterPageCount: 0,
  },
  languageAudit: {
    altTextLanguageInvalidCount: 0,
    actualTextLanguageInvalidCount: 0,
    annotationContentsLanguageInvalidCount: 0,
    formTuLanguageInvalidCount: 0,
    outlineLanguageInvalidCount: 0,
    expansionTextLanguageInvalidCount: 0,
    structureLangInvalidCount: 0,
    textObjectLanguageInvalidCount: 0,
  },
  renderedContrastAudit: {
    measured: false,
    lowContrastTextRunCount: 0,
    uncertainTextRunCount: 0,
    sampledPageCount: 0,
    confidenceReason: 'disabled',
  },
  structureSyntaxAudit: {
    missingStructureTypeCount: 0,
    missingRoleCount: 0,
    missingParentCount: 0,
    wrongParentCount: 0,
    invalidChildRoleCount: 0,
    invalidMcrObjrCount: 0,
    circularRoleMapCount: 0,
    standardRoleRemappedCount: 0,
    unmappedNonstandardRoleCount: 0,
  },
  tocNoteAudit: {
    tocItemMissingLinkCount: 0,
    tocDestinationMissingCount: 0,
    noteMissingIdCount: 0,
    duplicateNoteIdCount: 0,
    noteMissingLabelOrReferenceCount: 0,
    tocItemsChecked: 0,
    notesChecked: 0,
  },
  optionalContentAudit: {
    optionalContentConfigMissingNameCount: 0,
    optionalContentAsInvalidCount: 0,
    embeddedFileMissingFOrUfCount: 0,
    dynamicXfaPresent: false,
    printerMarkOrTrapNetTaggedCount: 0,
  },
  linkReachabilityAudit: {
    checked: false,
    unreachableUriCount: 0,
    unsafeUriCount: 0,
    checkedUriCount: 0,
  },
  aiVisualTagAudit: {
    evaluated: false,
    falsePositiveTagCount: 0,
    falseNegativeTagCount: 0,
    likelyMisclassifiedTagCount: 0,
    evaluationReason: 'disabled',
  },
  listStructureAudit: undefined,
};

export async function runPythonAnalysis(
  pdfPath: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<PythonAnalysisResult> {
  const timeoutMs = Math.max(1, options?.timeoutMs ?? PYTHON_TIMEOUT_MS);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const done = (result: PythonAnalysisResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PDFAF_SEMANTIC_MCID_MAX_PAGES: String(SEMANTIC_MCID_MAX_PAGES),
      },
    });

    const timer = setTimeout(() => {
      if (!settled) {
        console.error(`[bridge] python analysis timed out after ${timeoutMs}ms for: ${pdfPath}`);
        proc.kill('SIGKILL');
        done(EMPTY_RESULT);
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!settled) {
        proc.kill('SIGKILL');
        done(EMPTY_RESULT);
      }
    };
    if (options?.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      console.error(`[bridge] failed to spawn python3: ${err.message}`);
      done(EMPTY_RESULT);
    });

    proc.on('close', (code) => {
      options?.signal?.removeEventListener('abort', onAbort);
      if (stderr.trim()) {
        // Print warnings from the script but don't fail
        stderr.trim().split('\n').forEach(line =>
          console.warn(`[python] ${line}`)
        );
      }

      if (!stdout.trim()) {
        console.error(`[bridge] python script produced no output (exit ${code})`);
        done(EMPTY_RESULT);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as PythonAnalysisResult;
        done(parsed);
      } catch (e) {
        console.error(`[bridge] JSON parse failed: ${(e as Error).message}`);
        done(EMPTY_RESULT);
      }
    });
  });
}

/**
 * Apply pikepdf mutations via `pdf_analysis_helper.py --mutate <request.json>`.
 * Writes a new output file atomically; on any hard failure returns the original buffer.
 */
export async function runPythonMutationBatch(
  buffer: Buffer,
  mutations: PythonMutation[],
  options?: { signal?: AbortSignal; timeoutMs?: number; abortOnFailedOp?: boolean; reopenBetweenOps?: boolean },
): Promise<{ buffer: Buffer; result: BatchMutationResult }> {
  const empty: BatchMutationResult = { success: true, applied: [], failed: [] };
  if (mutations.length === 0) {
    return { buffer, result: empty };
  }

  const id = randomUUID();
  const inputPath = join(tmpdir(), `pdfaf-mut-in-${id}.pdf`);
  const outputPath = join(tmpdir(), `pdfaf-mut-out-${id}.pdf`);
  const requestPath = join(tmpdir(), `pdfaf-mut-req-${id}.json`);
  const defaultTimeout =
    mutations.length === 1 && mutations[0]?.op === 'ocr_scanned_pdf'
      ? OCR_MUTATION_TIMEOUT_MS
      : PYTHON_MUTATION_TIMEOUT_MS;
  const timeoutMs = options?.timeoutMs ?? defaultTimeout;

  await writeFile(inputPath, buffer);
  await writeFile(
    requestPath,
    JSON.stringify({
      input_path: inputPath,
      output_path: outputPath,
      mutations,
      abort_on_failed_op: options?.abortOnFailedOp === true,
      reopen_between_ops: options?.reopenBetweenOps === true,
    }),
  );

  const result = await new Promise<BatchMutationResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const done = (r: BatchMutationResult) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(r);
    };

    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, '--mutate', requestPath], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PDFAF_PDF_HELPER_INTEGER_COMPAT: '1',
      },
    });

    const killProcessGroup = () => {
      if (proc.pid == null) return;
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process already exited.
        }
      }
    };

    timer = setTimeout(() => {
      if (!settled) {
        killProcessGroup();
        done({ success: false, applied: [], failed: [{ op: '_batch', error: `timeout ${timeoutMs}ms` }] });
      }
    }, timeoutMs);

    const onAbort = () => {
      killProcessGroup();
      done({ success: false, applied: [], failed: [{ op: '_batch', error: 'aborted' }] });
    };
    if (options?.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });

    proc.on('error', () => {
      done({ success: false, applied: [], failed: [{ op: '_batch', error: 'spawn failed' }] });
    });

    proc.on('close', () => {
      if (stderr.trim()) {
        stderr.trim().split('\n').forEach(line => console.warn(`[python-mutate] ${line}`));
      }
      if (!stdout.trim()) {
        done({ success: false, applied: [], failed: [{ op: '_batch', error: 'no stdout' }] });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as BatchMutationResult;
        done(parsed);
      } catch {
        done({ success: false, applied: [], failed: [{ op: '_batch', error: 'invalid JSON' }] });
      }
    });
  });

  const cleanup = async (): Promise<void> => {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(requestPath).catch(() => {}),
    ]);
    if (!result.success) {
      await unlink(outputPath).catch(() => {});
    }
  };

  try {
    if (!result.success) {
      return { buffer, result };
    }
    const out = await readFile(outputPath);
    await unlink(outputPath).catch(() => {});
    return { buffer: out, result };
  } finally {
    await cleanup();
  }
}
