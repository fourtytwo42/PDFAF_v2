import { Router, type IRouter } from 'express';
import multer from 'multer';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MAX_FILE_SIZE_MB } from '../config.js';
import { sendApiError } from '../apiError.js';
import { logError } from '../logging.js';
import { analyzePdf } from '../services/pdfAnalyzer.js';
import { toApiAnalysisResult } from '../services/api/serializeAnalysis.js';

export const analyzeRouter: IRouter = Router();

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

analyzeRouter.post('/', upload.single('file'), async (req, res) => {
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
  const filename = req.file.originalname || `upload-${randomUUID()}.pdf`;

  try {
    const { result } = await analyzePdf(tempPath, filename);
    res.json(toApiAnalysisResult(result));
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 429) {
      sendApiError(
        res,
        429,
        'SERVER_AT_CAPACITY',
        'Server is at capacity. Try again shortly.',
      );
      return;
    }
    logError({
      message: 'analyze_failed',
      requestId: res.locals.requestId,
      filename,
      error: e.message,
    });
    sendApiError(res, 500, 'INTERNAL_ERROR', 'Analysis failed. Check server logs.');
  } finally {
    unlink(tempPath).catch(() => { /* temp file cleanup, ignore errors */ });
  }
});
