/**
 * Multer upload middleware.
 *
 * Stores uploads on local disk under `UPLOAD_DIR` with a UUID-prefixed
 * filename to avoid collisions. The original name is preserved on
 * `file.originalname` so it can be persisted on the Image document.
 *
 * Limits + MIME filtering come from validated config. In production,
 * swap the disk engine for an S3 / GCS multer plugin — keep this
 * middleware's exported surface stable so callers don't change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../utils/constants.js';

const uploadDir = path.resolve(process.cwd(), config.upload.dir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${randomUUID()}${ext.toLowerCase()}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(
    new ApiError(415, `Unsupported mime type: ${file.mimetype}`, {
      code: ERROR_CODES.UPLOAD_ERROR,
      details: { allowed: config.upload.allowedMimeTypes },
    }),
  );
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxBytes, files: 1 },
});

/** Single-file upload middleware — field name is `image`. */
export const singleImageUpload = upload.single('image');
