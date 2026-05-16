/**
 * Image processing worker (consumer side).
 *
 * Consumes jobs from the image-processing queue and orchestrates the
 * analysis pipeline:
 *
 *   1. dimension validation   (cheap; could short-circuit downstream)
 *   2. blur detection         (Laplacian variance)
 *   3. brightness analysis    (mean grayscale intensity)
 *   4. OCR                    (Tesseract.js)
 *   5. plate validation       (regex against Indian formats)
 *   6. duplicate detection    (dHash + Hamming distance over Mongo)
 *
 * Design choices:
 *   - The processor owns ALL status transitions on the Image document.
 *     Analyzers are pure(-ish) functions that take a path and return
 *     a result object; they never touch Mongo. This keeps them easy
 *     to unit-test and easy to swap.
 *   - Steps 1–3 are run in parallel (independent, all CPU/io bound on
 *     the same file). OCR + plate validation are sequential (plate
 *     consumes the OCR output). Duplicate detection runs last because
 *     it queries Mongo and benefits from the document already being
 *     in a known state.
 *   - A single analyzer failure does NOT poison the whole pipeline —
 *     each step is wrapped in `safe()` which records the error inline
 *     instead of throwing. We only throw (and let BullMQ retry) on
 *     unrecoverable conditions (file missing, DB down).
 *   - On terminal failure (attempts exhausted), the `failed` event
 *     handler persists the reason and stamps `processedAt`.
 */

import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { JOB_STATUS } from '../utils/constants.js';
import { createRedisConnection } from '../queues/connection.js';
import { ImageModel } from '../models/image.model.js';

import {
  runBlurDetection,
  runBrightnessAnalysis,
  runDimensionValidation,
  runDuplicateDetection,
} from '../services/image/index.js';
import { runOcr, disposeOcr } from '../services/ocr/index.js';
import { validateIndianPlate } from '../services/validation/index.js';

const log = logger.child({ component: 'worker:image' });

/**
 * Run an analyzer and capture failures inline. The pipeline can keep
 * going even when a single step blows up — the failure is visible on
 * the persisted document under `<step>.error`.
 */
const safe = async (name, fn, jobLog) => {
  const startedAt = Date.now();
  try {
    const result = await fn();
    jobLog.debug(`${name} done`, { ms: Date.now() - startedAt });
    return result;
  } catch (err) {
    jobLog.error(`${name} failed`, { err, ms: Date.now() - startedAt });
    return { error: err?.message ?? 'unknown error' };
  }
};

const processImageJob = async (job) => {
  const { imageId, storagePath } = job.data;
  const jobLog = log.child({ jobId: job.id, imageId, attempt: job.attemptsMade + 1 });

  jobLog.info('job started', { storagePath });

  await ImageModel.updateOne(
    { imageId },
    {
      $set: { status: JOB_STATUS.PROCESSING, processingStartedAt: new Date() },
      $inc: { attempts: 1 },
    },
  );

  // Steps 1-3: independent, run concurrently.
  const [dimensions, blur, brightness] = await Promise.all([
    safe('dimensions', () => runDimensionValidation(storagePath), jobLog),
    safe('blur', () => runBlurDetection(storagePath), jobLog),
    safe('brightness', () => runBrightnessAnalysis(storagePath), jobLog),
  ]);

  // Step 4-5: OCR feeds the plate validator — must be sequential.
  const ocr = await safe('ocr', () => runOcr(storagePath), jobLog);
  const plate = ocr?.extractedText
    ? validateIndianPlate(ocr.extractedText)
    : { isValidPlate: false, matchedPattern: null };

  // Step 6: duplicate detection (touches Mongo).
  const duplicate = await safe(
    'duplicate',
    () => runDuplicateDetection(storagePath, { imageId }),
    jobLog,
  );

  const analysisResults = { dimensions, blur, brightness, ocr, plate, duplicate };

  await ImageModel.updateOne(
    { imageId },
    {
      $set: {
        status: JOB_STATUS.COMPLETED,
        processedAt: new Date(),
        analysisResults,
        failureReason: null,
      },
    },
  );

  jobLog.info('job completed');
  return { imageId, status: JOB_STATUS.COMPLETED };
};

let workerInstance = null;

export const startImageWorker = () => {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(config.queue.imageQueueName, processImageJob, {
    connection: createRedisConnection('worker:image'),
    concurrency: config.queue.concurrency,
  });

  workerInstance.on('active', (job) => log.debug('job active', { jobId: job.id }));
  workerInstance.on('completed', (job) => log.info('job completed', { jobId: job.id }));

  workerInstance.on('failed', async (job, err) => {
    log.error('job failed', { jobId: job?.id, attempt: job?.attemptsMade, err });

    if (!job) return;
    const maxAttempts = job.opts.attempts ?? config.queue.attempts;
    // Only persist the terminal `failed` status once BullMQ stops retrying.
    if (job.attemptsMade >= maxAttempts) {
      try {
        await ImageModel.updateOne(
          { imageId: job.data.imageId },
          {
            $set: {
              status: JOB_STATUS.FAILED,
              processedAt: new Date(),
              failureReason: err?.message ?? 'unknown error',
            },
          },
        );
      } catch (persistErr) {
        log.error('failed to persist terminal failure', { err: persistErr });
      }
    }
  });

  workerInstance.on('error', (err) => log.error('worker error', { err }));

  log.info('image worker started', {
    queue: config.queue.imageQueueName,
    concurrency: config.queue.concurrency,
  });
  return workerInstance;
};

export const stopImageWorker = async () => {
  if (!workerInstance) return;
  log.info('stopping image worker');
  await workerInstance.close();
  workerInstance = null;
  // Release the Tesseract worker so the process can exit cleanly.
  await disposeOcr();
};
