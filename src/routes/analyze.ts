import { Router, type IRouter } from 'express';
import multer from 'multer';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_FILE_SIZE_MB } from '../config.js';
import { analyzePdf } from '../services/pdfAnalyzer.js';

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
    res.status(400).json({ error: 'No file uploaded. Send a PDF as multipart field "file".' });
    return;
  }

  const tempPath = req.file.path;
  const filename = req.file.originalname || `upload-${randomUUID()}.pdf`;

  try {
    const result = await analyzePdf(tempPath, filename);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 429) {
      res.status(429).json({ error: 'Server is at capacity. Try again shortly.' });
      return;
    }
    console.error(`[analyze] error for ${filename}:`, e.message);
    res.status(500).json({ error: 'Analysis failed. Check server logs.' });
  } finally {
    unlink(tempPath).catch(() => { /* temp file cleanup, ignore errors */ });
  }
});
