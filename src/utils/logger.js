/**
 * Centralized Winston logger.
 *
 *  - JSON output in production for structured ingestion (Datadog/ELK/CloudWatch).
 *  - Pretty, colorized output in development for human readability.
 *  - Daily-rotated file transports for `error` and combined logs.
 *  - A `.child(meta)` helper so each module can tag its logs (component,
 *    jobId, requestId, ...). Use it; do NOT use `console`.
 *
 * Example:
 *   import { logger } from '../utils/logger.js';
 *   const log = logger.child({ component: 'image-worker' });
 *   log.info('job started', { jobId });
 */

import path from 'node:path';
import fs from 'node:fs';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/index.js';

const logDir = path.resolve(process.cwd(), config.log.dir);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
);

const jsonFormat = winston.format.combine(baseFormat, winston.format.json());

const prettyFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize({ all: false }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${stack || message}${metaStr}`;
  }),
);

const transports = [
  new winston.transports.Console({
    format: config.isProd ? jsonFormat : prettyFormat,
  }),
  new DailyRotateFile({
    dirname: logDir,
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: jsonFormat,
  }),
  new DailyRotateFile({
    dirname: logDir,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '30d',
    format: jsonFormat,
  }),
];

export const logger = winston.createLogger({
  level: config.log.level,
  defaultMeta: { service: 'media-pipeline' },
  transports,
  exitOnError: false,
});

// Morgan pipes HTTP access logs through here at the `http` level.
export const httpLogStream = {
  write: (message) => logger.http(message.trim()),
};

export default logger;
