/**
 * Brightness analysis.
 *
 * Strategy:
 *   1. Decode + grayscale with Sharp -> single-channel 8-bit buffer.
 *      Sharp uses ITU-R BT.601 luma weights, which matches what
 *      OpenCV's cvtColor(BGR2GRAY) produces — i.e. a perceptually
 *      reasonable luminance, not a simple RGB average.
 *   2. Compute the mean intensity (0–255).
 *   3. Classify against two thresholds:
 *        mean < darkBelow      -> 'dark'
 *        mean > brightAbove    -> 'overexposed'
 *        otherwise             -> 'normal'
 *
 * Thresholds are conservative defaults — adjust per dataset.
 *
 * @param {string} storagePath
 * @param {object} [opts]
 * @param {number} [opts.darkBelow=60]
 * @param {number} [opts.brightAbove=200]
 * @returns {Promise<{ brightnessLevel: 'dark'|'normal'|'overexposed', brightnessScore: number }>}
 */

import sharp from 'sharp';

const DEFAULT_DARK_BELOW = 60;
const DEFAULT_BRIGHT_ABOVE = 200;

export const runBrightnessAnalysis = async (storagePath, opts = {}) => {
  const darkBelow = opts.darkBelow ?? DEFAULT_DARK_BELOW;
  const brightAbove = opts.brightAbove ?? DEFAULT_BRIGHT_ABOVE;

  // Use Sharp's built-in stats — it streams the image and computes
  // per-channel mean in C, an order of magnitude faster than walking
  // the raw buffer ourselves.
  const { channels } = await sharp(storagePath).grayscale().stats();
  const mean = channels[0]?.mean ?? 0;

  let brightnessLevel;
  if (mean < darkBelow) brightnessLevel = 'dark';
  else if (mean > brightAbove) brightnessLevel = 'overexposed';
  else brightnessLevel = 'normal';

  return {
    brightnessLevel,
    brightnessScore: Number(mean.toFixed(2)),
  };
};
