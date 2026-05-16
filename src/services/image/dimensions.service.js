/**
 * Image dimension validation.
 *
 * Reads width/height via Sharp metadata (no full decode required) and
 * compares against minimum bounds. Defaults of 200x200 are a sane
 * floor — downstream OCR and blur detection both produce noisy
 * results on tiny crops.
 *
 * @param {string} storagePath
 * @param {object} [opts]
 * @param {number} [opts.minWidth=200]
 * @param {number} [opts.minHeight=200]
 * @returns {Promise<{ validDimensions: boolean, width: number, height: number }>}
 */

import sharp from 'sharp';

// 150px floor accommodates phone-shared / messenger-resized photos
// (WhatsApp/Twitter often resize to ~250-320px) while still rejecting
// thumbnail-only inputs where neither OCR nor blur detection produce
// usable signal.
const DEFAULT_MIN_WIDTH = 150;
const DEFAULT_MIN_HEIGHT = 150;

export const runDimensionValidation = async (storagePath, opts = {}) => {
  const minWidth = opts.minWidth ?? DEFAULT_MIN_WIDTH;
  const minHeight = opts.minHeight ?? DEFAULT_MIN_HEIGHT;

  const metadata = await sharp(storagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  return {
    validDimensions: width >= minWidth && height >= minHeight,
    width,
    height,
  };
};
