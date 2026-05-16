/**
 * Application-wide enums and constants.
 *
 * Keep the surface area small — only put values here that are
 * referenced from more than one module. Single-use literals belong
 * next to the code that uses them.
 */

/**
 * Lifecycle states of an image-processing job.
 * Mirrored on the Mongo document AND used as the BullMQ job name space.
 */
export const JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/** All valid job status values, useful for Mongoose enum + Joi validation. */
export const JOB_STATUS_VALUES = Object.freeze(Object.values(JOB_STATUS));

/**
 * Named jobs published to the image-processing queue. Workers branch
 * on this name when routing a job to its handler.
 */
export const JOB_NAMES = Object.freeze({
  PROCESS_IMAGE: 'process-image',
});

/**
 * HTTP error codes mapped to short, machine-readable strings. The
 * `code` is what clients should branch on; messages may change.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});
