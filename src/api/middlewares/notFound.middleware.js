/**
 * 404 fallback for unmatched routes.
 *
 * Register AFTER all routes but BEFORE the error handler — it just
 * forwards an ApiError so the error handler shapes the response.
 */

import { ApiError } from '../../utils/ApiError.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export default notFoundHandler;
