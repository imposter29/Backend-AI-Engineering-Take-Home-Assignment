/**
 * Shared ioredis connection factory for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it
 * uses for blocking commands (workers). We return a fresh connection
 * per caller — BullMQ's Queue/Worker/QueueEvents each need their own
 * socket to avoid head-of-line blocking.
 *
 * Centralising this here means we configure Redis options in one
 * place; queue/worker modules just call `createRedisConnection()`.
 */

import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'redis' });

// Required by BullMQ for blocking commands; harmless for everything else.
const bullmqRequired = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
};

export const createRedisConnection = (label = 'generic') => {
  // Managed providers (Upstash, Render Key Value, ElastiCache) give a
  // single URL. ioredis accepts that URL directly and auto-enables TLS
  // when the scheme is `rediss://`. Fall back to discrete host/port for
  // local Docker compose, which has no URL to hand out.
  const conn = config.redis.url
    ? new IORedis(config.redis.url, bullmqRequired)
    : new IORedis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        ...bullmqRequired,
      });

  conn.on('connect', () => log.info('redis connected', { label }));
  conn.on('ready', () => log.debug('redis ready', { label }));
  conn.on('error', (err) => log.error('redis error', { label, err }));
  conn.on('close', () => log.warn('redis connection closed', { label }));
  conn.on('reconnecting', (ms) => log.warn('redis reconnecting', { label, ms }));

  return conn;
};

export default createRedisConnection;
