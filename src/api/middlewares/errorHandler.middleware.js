/**
 * Centralized Express error handler.
 *
 *  - ApiError instances are surfaced as-is (their status code, code,
 *    message, and optional `details` reach the client).
 *  - Multer errors are mapped to 400/413 with stable codes.
 *  - Mongoose CastError / ValidationError get 400s.
 *  - Anything else is treated as a 500 and scrubbed before reply —
 *    the full stack still lands in the logs.
 *
 * Always register this LAST in app.js, after all routes.
 */

import multer from 'multer';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../utils/constants.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const log = logger.child({ component: 'http', requestId: req.id });

  let status = 500;
  let code = ERROR_CODES.INTERNAL_ERROR;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = ERROR_CODES.UPLOAD_ERROR;
    message = err.message;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = `Invalid value for ${err.path}`;
  }

  if (status >= 500) {
    log.error('request failed', { err, path: req.originalUrl, method: req.method });
  } else {
    log.warn('request rejected', {
      status,
      code,
      message,
      path: req.originalUrl,
      method: req.method,
    });
  }

  const body = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    requestId: req.id,
  };

  // In development, expose the stack to speed up debugging.
  if (!config.isProd && status >= 500 && err?.stack) {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
};

export default errorHandler;
