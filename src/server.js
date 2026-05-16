/**
 * HTTP server entrypoint.
 *
 * Responsibilities:
 *   - Connect dependencies (Mongo) BEFORE binding the port so /health
 *     never returns "ok" while the DB is still warming up.
 *   - Bind the HTTP listener.
 *   - Optionally start the BullMQ worker in-process when
 *     START_WORKER_IN_API=true. Convenient for local dev and for the
 *     take-home demo; in production we set the flag false and run
 *     `npm run worker` as a separate service (see docker-compose.yml).
 *   - Wire signal handlers for graceful shutdown (drain HTTP, close
 *     worker, close queue, disconnect Mongo, then exit).
 *   - Trap unhandledRejection / uncaughtException so the orchestrator
 *     can restart a clean process instead of leaving a zombie.
 */

import http from 'node:http';

import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { connectMongo, disconnectMongo } from './database/mongo.js';
import { closeImageQueue } from './queues/index.js';
import { startImageWorker, stopImageWorker } from './workers/imageProcessing.worker.js';

const log = logger.child({ component: 'server' });

const bootstrap = async () => {
  log.info('starting HTTP server', {
    env: config.nodeEnv,
    port: config.port,
    apiPrefix: config.apiPrefix,
    workerInApi: config.queue.startWorkerInApi,
  });

  // Dependencies first so /health is honest from the first request.
  await connectMongo();

  // Optional in-process worker. Logs from BullMQ on first connect will
  // surface Redis health — we don't ping explicitly because BullMQ
  // already retries and reports `error`/`reconnecting` via the queue
  // events wired in src/queues/connection.js.
  if (config.queue.startWorkerInApi) {
    startImageWorker();
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(config.port, () => {
    log.info(`HTTP server listening on :${config.port}`);
  });

  const shutdown = async (signal) => {
    log.info(`received ${signal}, shutting down`);
    server.close(async (err) => {
      if (err) log.error('error closing http server', { err });
      try {
        await stopImageWorker();
        await closeImageQueue();
        await disconnectMongo();
        process.exit(0);
      } catch (closeErr) {
        log.error('error during shutdown', { err: closeErr });
        process.exit(1);
      }
    });

    // Hard timeout — if in-flight requests don't drain in 15s, exit anyway.
    setTimeout(() => {
      log.warn('forcing shutdown after 15s grace period');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { reason });
  });
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err });
    // Exit and let the orchestrator restart a clean process.
    process.exit(1);
  });
};

bootstrap().catch((err) => {
  log.error('server bootstrap failed', { err });
  process.exit(1);
});
