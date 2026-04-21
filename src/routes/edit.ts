import { Router, type IRouter } from 'express';
import multer from 'multer';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MAX_FILE_SIZE_MB } from '../config.js';
import { sendApiError } from '../apiError.js';
import { logError, logInfo } from '../logging.js';
import { editFixInstructionListSchema } from '../schemas/editFixes.js';
import { applyEditFixes } from '../services/edit/applyFixes.js';
import { toApiAnalysisResult } from '../services/api/serializeAnalysis.js';

export const editRouter: IRouter = Router();

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

editRouter.post('/apply-fixes', upload.single('file'), async (req, res) => {
  if (!req.file) {
    sendApiError(
      res,
      400,
      'BAD_REQUEST',
      'No file uploaded. Send a PDF as multipart field "file".',
    );
    return;
  }

  const tempPath = req.file.path;
  const filename = req.file.originalname || `edit-${randomUUID()}.pdf`;

  try {
    const rawFixes = req.body?.['fixes'];
    if (typeof rawFixes !== 'string' || rawFixes.trim().length === 0) {
      sendApiError(res, 400, 'BAD_REQUEST', 'Field "fixes" must be a JSON string.');
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(rawFixes);
    } catch {
      sendApiError(res, 400, 'BAD_REQUEST', 'Field "fixes" must be valid JSON.');
      return;
    }

    const parsed = editFixInstructionListSchema.safeParse(json);
    if (!parsed.success) {
      sendApiError(res, 400, 'INVALID_OPTIONS', 'Invalid fixes', parsed.error.flatten());
      return;
    }

    const buffer = await readFile(tempPath);
    const result = await applyEditFixes({
      buffer,
      filename,
      fixes: parsed.data,
    });

    logInfo({
      message: 'edit_apply_fixes_complete',
      requestId: res.locals.requestId,
      filename,
      details: {
        applied: result.appliedFixes.length,
        rejected: result.rejectedFixes.length,
      },
    });

    res.json({
      before: toApiAnalysisResult(result.before),
      after: toApiAnalysisResult(result.after),
      appliedFixes: result.appliedFixes,
      rejectedFixes: result.rejectedFixes,
      fixedPdfBase64: result.buffer.toString('base64'),
    });
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    logError({
      message: 'edit_apply_fixes_failed',
      requestId: res.locals.requestId,
      filename,
      error: err.message,
    });
    sendApiError(res, 500, 'INTERNAL_ERROR', 'Unable to apply edit fixes.');
  } finally {
    unlink(tempPath).catch(() => { /* temp file cleanup, ignore errors */ });
  }
});
