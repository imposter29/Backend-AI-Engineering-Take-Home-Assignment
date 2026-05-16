/**
 * GET /api/v1/status/:id
 *
 * Lightweight status check — returns only lifecycle fields, not the
 * full analysis payload. Clients poll this; keep it cheap.
 */

import { ImageModel } from '../../models/image.model.js';
import { ApiError } from '../../utils/ApiError.js';

export const getStatus = async (req, res) => {
  const { id } = req.params;

  const doc = await ImageModel.findOne(
    { imageId: id },
    {
      imageId: 1,
      status: 1,
      uploadedAt: 1,
      processingStartedAt: 1,
      processedAt: 1,
      attempts: 1,
      failureReason: 1,
    },
  ).lean();

  if (!doc) {
    throw ApiError.notFound(`Image ${id} not found`);
  }

  res.json({ success: true, data: doc });
};
