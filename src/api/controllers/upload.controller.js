/**
 * POST /api/v1/upload
 *
 * Accepts a single image (field name: `image`, multipart/form-data),
 * persists a metadata document in the `pending` state, and enqueues
 * a processing job. Returns the imageId so clients can poll status.
 *
 * NOTE: This is the request-time path only. Heavy work (decoding,
 * OCR, hashing) is delegated to the BullMQ worker so the HTTP response
 * stays fast and the API stays horizontally scalable.
 */

import { randomUUID } from 'node:crypto';
import { ImageModel } from '../../models/image.model.js';
import { enqueueImageProcessing } from '../../queues/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { JOB_STATUS } from '../../utils/constants.js';
import { logger } from '../../utils/logger.js';

export const uploadImage = async (req, res) => {
  const log = logger.child({ component: 'controller:upload', requestId: req.id });

  if (!req.file) {
    throw ApiError.badRequest('No file uploaded (expected field "image")');
  }

  const imageId = randomUUID();

  const doc = await ImageModel.create({
    imageId,
    filename: req.file.filename,
    originalName: req.file.originalname,
    storagePath: req.file.path,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    status: JOB_STATUS.PENDING,
  });

  try {
    const job = await enqueueImageProcessing({
      imageId,
      storagePath: req.file.path,
    });
    doc.jobId = job.id;
    await doc.save();
  } catch (err) {
    // If the queue is down we still keep the document so the upload
    // isn't silently lost — flag it as failed with a clear reason.
    log.error('failed to enqueue job; marking record as failed', { err, imageId });
    doc.status = JOB_STATUS.FAILED;
    doc.failureReason = 'Failed to enqueue processing job';
    doc.processedAt = new Date();
    await doc.save();
    throw ApiError.internal('Failed to enqueue processing job', { cause: err });
  }

  res.status(202).json({
    success: true,
    data: {
      imageId,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
    },
  });
};
