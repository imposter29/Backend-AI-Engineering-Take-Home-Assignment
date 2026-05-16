/**
 * Worker process entrypoint.
 *
 * Started as a SEPARATE process from the HTTP API:
 *   npm run worker
 *
 * This gives us the ability to scale HTTP and worker pools
 * independently — and means a crash in one analyzer cannot take down
 * the API. Both processes share env + config + Mongo connection
 * bootstrap; only the queue-consumer side runs here.
 */

import { connectMongo, disconnectMongo } from '../database/mongo.js';
import { logger } from '../utils/logger.js';
import { startImageWorker, stopImageWorker } from './imageProcessing.worker.js';

const log = logger.child({ component: 'worker-process' });

const main = async () => {
  log.info('worker process booting');
  await connectMongo();
  startImageWorker();
  log.info('worker process ready');
};

const shutdown = async (signal) => {
  log.info(`received ${signal}, shutting down worker`);
  try {
    await stopImageWorker();
    await disconnectMongo();
    process.exit(0);
  } catch (err) {
    log.error('error during worker shutdown', { err });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason });
});
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err });
  // Worker is in an unknown state — exit so the orchestrator restarts it.
  process.exit(1);
});

main().catch((err) => {
  log.error('worker boot failed', { err });
  process.exit(1);
});
