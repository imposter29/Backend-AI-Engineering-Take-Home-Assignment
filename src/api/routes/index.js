/**
 * API v1 router.
 *
 * Mounts versioned feature routers under a single prefix so app.js
 * only knows about ONE router. New endpoints get added here; the
 * prefix in `config.apiPrefix` keeps versioning future-proof.
 */

import { Router } from 'express';
import uploadRoutes from './upload.routes.js';
import statusRoutes from './status.routes.js';
import resultsRoutes from './results.routes.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    name: 'Intelligent Media Processing Pipeline',
    version: 'v1',
    endpoints: ['POST /upload', 'GET /status/:id', 'GET /results/:id'],
  });
});

router.use('/', uploadRoutes);
router.use('/', statusRoutes);
router.use('/', resultsRoutes);

export default router;
