/**
 * Results routes.
 *   GET /results/:id   full structured analysis payload.
 */

import { Router } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../middlewares/validation.middleware.js';
import { getResults } from '../controllers/results.controller.js';

const router = Router();

const paramsSchema = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

router.get('/results/:id', validate({ params: paramsSchema }), asyncHandler(getResults));

export default router;
