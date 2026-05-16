/**
 * Blur detection via variance of the Laplacian.
 *
 * The canonical OpenCV-style approach: convolve a grayscale image
 * with the discrete 3x3 Laplacian kernel and report the variance of
 * the response. High variance = lots of edges = sharp; low variance
 * = washed-out edges = blurry.
 *
 *           [ 0  1  0 ]
 *   L  =    [ 1 -4  1 ]
 *           [ 0  1  0 ]
 *
 * We use Sharp to decode and grayscale (libvips is fast and avoids
 * a WASM init cost), then run the convolution in plain JS on the raw
 * Uint8 buffer. For typical phone-sized inputs this is sub-50ms — a
 * dependency on `cv.Laplacian()` would only add WASM boot overhead
 * without changing the math.
 *
 * The threshold of 100 is the value popularised by the
 * PyImageSearch / Pech-Pacheco paper. It's a reasonable default for
 * 8-bit camera images but expose it as `opts.threshold` because real
 * tuning is dataset-dependent.
 *
 * @param {string} storagePath   Absolute path to the image on disk.
 * @param {object} [opts]
 * @param {number} [opts.threshold=100]  Variance below this => blurry.
 * @returns {Promise<{ isBlurry: boolean, blurScore: number, threshold: number }>}
 */

import sharp from 'sharp';

const DEFAULT_THRESHOLD = 100;

export const runBlurDetection = async (storagePath, opts = {}) => {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  const { data, info } = await sharp(storagePath)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (width < 3 || height < 3) {
    // Convolution undefined on degenerate inputs — fail closed.
    return { isBlurry: true, blurScore: 0, threshold };
  }

  // Welford-style single-pass mean+variance on the Laplacian response.
  // The kernel is applied directly without allocating a result buffer
  // — we only need the response statistics, not the response image.
  let count = 0;
  let mean = 0;
  let m2 = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = rowOffset + x;
      // Laplacian response at (x, y)
      const lap =
        data[i - width] + // top
        data[i + width] + // bottom
        data[i - 1] + // left
        data[i + 1] - // right
        4 * data[i]; // center

      count++;
      const delta = lap - mean;
      mean += delta / count;
      m2 += delta * (lap - mean);
    }
  }

  const variance = count > 1 ? m2 / count : 0;
  const blurScore = Number(variance.toFixed(2));

  return {
    isBlurry: blurScore < threshold,
    blurScore,
    threshold,
  };
};
