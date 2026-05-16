/**
 * Joi-backed request validator.
 *
 * Factory style — call `validate({ params, query, body })` and it
 * returns a middleware that validates each segment with its schema.
 * Validation errors are converted into ApiError(400) with a
 * structured `details` array suitable for client display.
 *
 * Example:
 *   const idSchema = Joi.object({ id: Joi.string().uuid().required() });
 *   router.get('/status/:id', validate({ params: idSchema }), controller);
 */

import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../utils/constants.js';

const SEGMENTS = ['params', 'query', 'body'];

export const validate = (schemas) => (req, _res, next) => {
  const details = [];

  for (const segment of SEGMENTS) {
    const schema = schemas?.[segment];
    if (!schema) continue;

    const { value, error } = schema.validate(req[segment], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      for (const d of error.details) {
        details.push({ segment, path: d.path.join('.'), message: d.message });
      }
      continue;
    }
    // Replace with the validated/coerced value so handlers see clean input.
    req[segment] = value;
  }

  if (details.length > 0) {
    return next(
      new ApiError(400, 'Request validation failed', {
        code: ERROR_CODES.VALIDATION_ERROR,
        details,
      }),
    );
  }
  next();
};

export default validate;
