/**
 * Environment variable loader + schema validator.
 *
 * Loads variables from `.env` (via dotenv) and validates them against a
 * Joi schema. The process refuses to boot if anything required is
 * missing or malformed — this is intentional: fail fast at startup
 * beats a confusing runtime error three hours later.
 *
 * Consumers should NEVER read `process.env` directly. Import the
 * frozen `env` object from this module or `config` from `./index.js`.
 */

import dotenv from 'dotenv';
import Joi from 'joi';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root regardless of where the process is started from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'debug')
    .default('info'),
  LOG_DIR: Joi.string().default('src/logs'),

  // Mongo
  MONGO_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
  MONGO_DB_NAME: Joi.string().default('media_pipeline'),

  // Redis
  // Prefer a single REDIS_URL when set — managed providers (Upstash,
  // Render Key Value, ElastiCache) hand out one. `rediss://` URLs
  // auto-enable TLS in ioredis. The discrete host/port/password vars
  // are kept as a fallback for local Docker compose where there's no
  // URL to pass.
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  // BullMQ
  IMAGE_QUEUE_NAME: Joi.string().default('image-processing'),
  WORKER_CONCURRENCY: Joi.number().integer().min(1).default(4),
  JOB_ATTEMPTS: Joi.number().integer().min(1).default(3),
  JOB_BACKOFF_MS: Joi.number().integer().min(0).default(5000),
  // When true, the API process also runs the BullMQ worker in-process.
  // Convenient for local dev / take-home demos; for production set false
  // and run `npm run worker` as a separate service (see docker-compose).
  START_WORKER_IN_API: Joi.boolean().default(true),

  // Uploads
  UPLOAD_DIR: Joi.string().default('src/uploads'),
  MAX_UPLOAD_BYTES: Joi.number().integer().min(1).default(10 * 1024 * 1024),
  ALLOWED_MIME_TYPES: Joi.string().default('image/jpeg,image/png,image/webp'),

  // CORS
  CORS_ORIGIN: Joi.string().default('*'),
}).unknown(true); // allow OS-provided vars (PATH etc.) without complaint

const { value, error } = envSchema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  // Use console here — the logger depends on a valid env to construct itself.
  // eslint-disable-next-line no-console
  console.error('[config] invalid environment configuration:');
  for (const detail of error.details) {
    // eslint-disable-next-line no-console
    console.error(`  - ${detail.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze({
  nodeEnv: value.NODE_ENV,
  isProd: value.NODE_ENV === 'production',
  isDev: value.NODE_ENV === 'development',
  isTest: value.NODE_ENV === 'test',

  port: value.PORT,
  apiPrefix: value.API_PREFIX,

  log: {
    level: value.LOG_LEVEL,
    dir: value.LOG_DIR,
  },

  mongo: {
    uri: value.MONGO_URI,
    dbName: value.MONGO_DB_NAME,
  },

  redis: {
    url: value.REDIS_URL,
    host: value.REDIS_HOST,
    port: value.REDIS_PORT,
    password: value.REDIS_PASSWORD || undefined,
    db: value.REDIS_DB,
  },

  queue: {
    imageQueueName: value.IMAGE_QUEUE_NAME,
    concurrency: value.WORKER_CONCURRENCY,
    attempts: value.JOB_ATTEMPTS,
    backoffMs: value.JOB_BACKOFF_MS,
    startWorkerInApi: value.START_WORKER_IN_API,
  },

  upload: {
    dir: value.UPLOAD_DIR,
    maxBytes: value.MAX_UPLOAD_BYTES,
    allowedMimeTypes: value.ALLOWED_MIME_TYPES.split(',').map((s) => s.trim()),
  },

  cors: {
    origin: value.CORS_ORIGIN,
  },
});
