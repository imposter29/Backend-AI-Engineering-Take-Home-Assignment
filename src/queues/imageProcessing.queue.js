/**
 * Image processing queue (producer side).
 *
 * Exposes:
 *   - `imageProcessingQueue`  — the BullMQ Queue instance.
 *   - `imageQueueEvents`      — QueueEvents for status streaming/hooks.
 *   - `enqueueImageProcessing(payload, opts)` — typed producer helper
 *     used by the upload controller. Always go through this helper so
 *     defaults (attempts, backoff, removeOnComplete) stay consistent.
 */

import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { JOB_NAMES } from '../utils/constants.js';
import { createRedisConnection } from './connection.js';

const log = logger.child({ component: 'queue:image' });

const queueConnection = createRedisConnection('queue:image');
const eventsConnection = createRedisConnection('queue-events:image');

export const imageProcessingQueue = new Queue(config.queue.imageQueueName, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: config.queue.attempts,
    backoff: { type: 'exponential', delay: config.queue.backoffMs },
    // Keep recent completed jobs for visibility, but bound it.
    removeOnComplete: { count: 1000, age: 24 * 3600 },
    // Keep failed jobs longer for postmortem.
    removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
  },
});

export const imageQueueEvents = new QueueEvents(config.queue.imageQueueName, {
  connection: eventsConnection,
});

imageQueueEvents.on('failed', ({ jobId, failedReason }) => {
  log.warn('job failed', { jobId, failedReason });
});

imageQueueEvents.on('completed', ({ jobId }) => {
  log.debug('job completed', { jobId });
});

/**
 * Enqueue an image-processing job.
 *
 * @param {object} payload                  Job payload (passed to worker).
 * @param {string} payload.imageId          Public image identifier.
 * @param {string} payload.storagePath      Absolute path to the file on disk.
 * @param {object} [opts]                   BullMQ JobsOptions override.
 * @returns {Promise<import('bullmq').Job>} The enqueued job.
 */
export const enqueueImageProcessing = async (payload, opts = {}) => {
  // jobId == imageId keeps producer/worker/Mongo aligned, and BullMQ
  // will de-duplicate accidental double-submissions.
  const job = await imageProcessingQueue.add(JOB_NAMES.PROCESS_IMAGE, payload, {
    jobId: payload.imageId,
    ...opts,
  });
  log.info('job enqueued', { jobId: job.id, imageId: payload.imageId });
  return job;
};

export const closeImageQueue = async () => {
  log.info('closing image queue');
  await Promise.all([imageProcessingQueue.close(), imageQueueEvents.close()]);
};
