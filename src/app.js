/**
 * Express application factory.
 *
 * Builds and returns a fully-configured Express app. Doing this in a
 * factory (rather than at module top-level) makes the app cleanly
 * testable — tests can spin up `createApp()` without binding a port.
 *
 * Middleware order matters here:
 *   1. requestId  -> every downstream log line is correlated.
 *   2. helmet/cors/compression -> security + transport concerns.
 *   3. body parsers -> applied AFTER multer-handled routes need them.
 *   4. requestLogger -> logs status codes set by handlers.
 *   5. routes
 *   6. notFound + errorHandler (always last).
 */

import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import { config } from './config/index.js';
import apiV1Router from './api/routes/index.js';
import { getHealth } from './api/controllers/health.controller.js';
import {
  requestIdMiddleware,
  requestLogger,
} from './api/middlewares/requestLogger.middleware.js';
import { notFoundHandler } from './api/middlewares/notFound.middleware.js';
import { errorHandler } from './api/middlewares/errorHandler.middleware.js';
import { asyncHandler } from './utils/asyncHandler.js';

export const createApp = () => {
  const app = express();

  // Trust the first proxy when running behind a load balancer / ingress.
  app.set('trust proxy', 1);
  // Hide the Express fingerprint.
  app.disable('x-powered-by');

  // Cross-cutting concerns.
  app.use(requestIdMiddleware);
  // Helmet's default CORP would block <img src="..."> from a different origin
  // (the frontend dev server). Loosen just that header — everything else stays on.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.cors.origin }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  // Static serving for previewing uploaded originals from the dashboard.
  // In production swap this for signed CDN URLs — see README for context.
  const uploadDir = path.resolve(process.cwd(), config.upload.dir);
  app.use(
    '/uploads',
    express.static(uploadDir, {
      index: false,
      dotfiles: 'ignore',
      maxAge: '1d',
    }),
  );

  // Unversioned ops endpoints.
  app.get('/health', asyncHandler(getHealth));

  // Versioned API surface.
  app.use(config.apiPrefix, apiV1Router);

  // 404 + central error handler — must be registered last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
