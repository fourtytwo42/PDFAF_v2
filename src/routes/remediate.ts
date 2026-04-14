import { Router, type IRouter } from 'express';
import multer from 'multer';
import { unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MAX_FILE_SIZE_MB } from '../config.js';
import { analyzePdf } from '../services/pdfAnalyzer.js';
import { remediatePdf } from '../services/remediation/orchestrator.js';

export const remediateRouter: IRouter = Router();

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

remediateRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send a PDF as multipart field "file".' });
    return;
  }

  const tempPath = req.file.path;
  const filename = req.file.originalname || `upload-${randomUUID()}.pdf`;

  try {
    const { result, snapshot } = await analyzePdf(tempPath, filename);
    const buffer = await readFile(tempPath);
    const remediation = await remediatePdf(buffer, filename, result, snapshot);
    res.json(remediation);
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 429) {
      res.status(429).json({ error: 'Server is at capacity. Try again shortly.' });
      return;
    }
    console.error(`[remediate] error for ${filename}:`, e.message);
    res.status(500).json({ error: 'Remediation failed. Check server logs.' });
  } finally {
    unlink(tempPath).catch(() => { /* temp file cleanup */ });
  }
});
