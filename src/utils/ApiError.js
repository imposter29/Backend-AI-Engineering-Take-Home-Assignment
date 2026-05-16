/**
 * Operational error class used throughout the HTTP layer.
 *
 * The central error handler distinguishes ApiError (expected, safe to
 * surface to clients) from arbitrary thrown errors (treated as 500s
 * and scrubbed). Anything thrown from controllers/services that the
 * client should see MUST be an ApiError.
 */

import { ERROR_CODES } from './constants.js';

export class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status code.
   * @param {string} message     Human-readable error message.
   * @param {object} [options]
   * @param {string} [options.code]     Stable machine-readable code (see ERROR_CODES).
   * @param {unknown} [options.details] Optional structured detail (validation errors etc.).
   * @param {Error}   [options.cause]   Wrapped underlying error.
   */
  constructor(statusCode, message, { code, details, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || ApiError.#defaultCodeForStatus(statusCode);
    this.details = details;
    this.isOperational = true;
    if (cause) this.cause = cause;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, opts) {
    return new ApiError(400, message, { code: ERROR_CODES.VALIDATION_ERROR, ...opts });
  }

  static notFound(message = 'Resource not found', opts) {
    return new ApiError(404, message, { code: ERROR_CODES.NOT_FOUND, ...opts });
  }

  static internal(message = 'Internal server error', opts) {
    return new ApiError(500, message, { code: ERROR_CODES.INTERNAL_ERROR, ...opts });
  }

  static #defaultCodeForStatus(status) {
    if (status === 400) return ERROR_CODES.VALIDATION_ERROR;
    if (status === 404) return ERROR_CODES.NOT_FOUND;
    return ERROR_CODES.INTERNAL_ERROR;
  }
}

export default ApiError;
