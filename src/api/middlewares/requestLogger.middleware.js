/**
 * HTTP access logging + per-request correlation id.
 *
 * Two middlewares are exported:
 *   - `requestIdMiddleware`  : attaches a UUID per request, surfaced
 *                              both on `req.id` and in the
 *                              `X-Request-Id` response header. This
 *                              id propagates into child loggers so
 *                              every log line in a request is joinable.
 *   - `requestLogger`        : Morgan, piped through Winston with the
 *                              request id included.
 *
 * Register `requestIdMiddleware` BEFORE any handler that logs, so the
 * correlation id is available everywhere.
 */

import { randomUUID } from 'node:crypto';
import morgan from 'morgan';
import { httpLogStream } from '../../utils/logger.js';
import { config } from '../../config/index.js';

morgan.token('id', (req) => req.id);

const format = config.isProd
  ? ':id :remote-addr :method :url :status :res[content-length] - :response-time ms'
  : ':id :method :url :status :response-time ms - :res[content-length]';

export const requestIdMiddleware = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

export const requestLogger = morgan(format, { stream: httpLogStream });
