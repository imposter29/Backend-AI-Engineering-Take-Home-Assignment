/**
 * Status routes.
 *   GET /status/:id   lifecycle status of an uploaded image.
 */

import { Router } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../middlewares/validation.middleware.js';
import { getStatus } from '../controllers/status.controller.js';

const router = Router();

const paramsSchema = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

router.get('/status/:id', validate({ params: paramsSchema }), asyncHandler(getStatus));

export default router;
