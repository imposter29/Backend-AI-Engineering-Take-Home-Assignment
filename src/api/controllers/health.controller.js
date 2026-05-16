/**
 * GET /health
 *
 * Liveness + readiness in one. Reports the state of the runtime,
 * Mongo and Redis. Useful for compose healthchecks, k8s probes, and
 * on-call dashboards.
 *
 * Status semantics:
 *   - "ok"       : process is up and all dependencies are reachable.
 *   - "degraded" : process is up but at least one dependency is not.
 */

import mongoose from 'mongoose';
import { imageProcessingQueue } from '../../queues/index.js';

const MONGO_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

export const getHealth = async (_req, res) => {
  const mongoState = MONGO_STATES[mongoose.connection.readyState] || 'unknown';

  let redisState = 'unknown';
  try {
    // BullMQ exposes the underlying ioredis client through .client.
    const client = await imageProcessingQueue.client;
    redisState = client.status; // 'ready' | 'connecting' | 'reconnecting' | ...
  } catch {
    redisState = 'error';
  }

  const healthy = mongoState === 'connected' && redisState === 'ready';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dependencies: { mongo: mongoState, redis: redisState },
  });
};
