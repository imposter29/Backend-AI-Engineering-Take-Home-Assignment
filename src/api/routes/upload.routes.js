/**
 * Upload routes.
 *   POST /upload   accepts a single image (field: "image").
 */

import { Router } from 'express';
import { singleImageUpload } from '../middlewares/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { uploadImage } from '../controllers/upload.controller.js';

const router = Router();

router.post('/upload', singleImageUpload, asyncHandler(uploadImage));

export default router;
