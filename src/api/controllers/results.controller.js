/**
 * GET /api/v1/results/:id
 *
 * Returns the full structured analysis payload. 404 if the image is
 * unknown; 409 if processing hasn't reached a terminal state yet — we
 * surface that explicitly so clients can distinguish "not done" from
 * "no such image".
 */

import { ImageModel } from '../../models/image.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { JOB_STATUS } from '../../utils/constants.js';

export const getResults = async (req, res) => {
  const { id } = req.params;

  const doc = await ImageModel.findOne({ imageId: id }).lean();
  if (!doc) {
    throw ApiError.notFound(`Image ${id} not found`);
  }

  if (doc.status !== JOB_STATUS.COMPLETED && doc.status !== JOB_STATUS.FAILED) {
    throw new ApiError(409, `Image ${id} is still ${doc.status}`, {
      details: { status: doc.status },
    });
  }

  res.json({
    success: true,
    data: {
      imageId: doc.imageId,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      processedAt: doc.processedAt,
      analysisResults: doc.analysisResults ?? {},
      failureReason: doc.failureReason ?? null,
    },
  });
};
