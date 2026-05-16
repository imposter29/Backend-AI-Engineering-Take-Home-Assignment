/**
 * Duplicate detection via difference-hash (dHash) perceptual hashing.
 *
 * Why dHash:
 *   - Robust to small color/lighting changes (we compare luminance gradients,
 *     not raw pixel values).
 *   - 64 bits — cheap to store, fast to compare with Hamming distance.
 *   - Constant-time construction: O(72) ops per image after the resize.
 *
 * Algorithm:
 *   1. Resize to 9x8 grayscale ("fill" — distortion is fine; we only
 *      care about gradients).
 *   2. For each row, compare adjacent pixels left-to-right. 1 if the
 *      left pixel is darker than the right, else 0. This produces an
 *      8x8 bitmap = 64 bits = a 16-char hex string.
 *   3. Hamming distance against existing hashes in Mongo decides
 *      "duplicate". Threshold defaults to 5 bits, which empirically
 *      catches near-duplicates without false positives across distinct
 *      images.
 *
 * Scalability note: brute-force scan over `ImageModel` is fine up to a
 * few hundred thousand records. Beyond that, swap the linear scan for
 * an LSH index (e.g. multi-probe LSH) or a hamming-distance friendly
 * datastore (ClickHouse, FAISS sidecar). The service surface stays
 * identical when that happens.
 *
 * @param {string} storagePath
 * @param {object} [ctx]
 * @param {string} [ctx.imageId]   Current image id — excluded from match search.
 * @param {object} [opts]
 * @param {number} [opts.hammingThreshold=5]
 * @returns {Promise<{ isDuplicate: boolean, imageHash: string, matchedImageId: string|null }>}
 */

import sharp from 'sharp';
import { ImageModel } from '../../models/image.model.js';
import { JOB_STATUS } from '../../utils/constants.js';

const DEFAULT_HAMMING_THRESHOLD = 5;

const computeDHash = async (storagePath) => {
  const { data } = await sharp(storagePath)
    .grayscale()
    .resize(9, 8, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 64-bit hash built as a BigInt, then hex-encoded for storage.
  let hash = 0n;
  let bit = 63n;
  for (let y = 0; y < 8; y++) {
    const row = y * 9;
    for (let x = 0; x < 8; x++) {
      const left = data[row + x];
      const right = data[row + x + 1];
      if (left < right) hash |= 1n << bit;
      bit--;
    }
  }
  return hash.toString(16).padStart(16, '0');
};

const hammingDistance = (hexA, hexB) => {
  // 64-bit XOR via BigInt, then popcount on the result.
  let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB);
  let count = 0;
  while (x > 0n) {
    if (x & 1n) count++;
    x >>= 1n;
  }
  return count;
};

export const runDuplicateDetection = async (storagePath, ctx = {}, opts = {}) => {
  const threshold = opts.hammingThreshold ?? DEFAULT_HAMMING_THRESHOLD;
  const imageHash = await computeDHash(storagePath);

  // Only compare against already-processed records. Exclude the
  // current image so an in-progress reprocess doesn't match itself.
  const candidates = await ImageModel.find(
    {
      'analysisResults.duplicate.imageHash': { $exists: true, $ne: null },
      imageId: { $ne: ctx.imageId },
      status: JOB_STATUS.COMPLETED,
    },
    { imageId: 1, 'analysisResults.duplicate.imageHash': 1 },
  ).lean();

  let best = null;
  for (const c of candidates) {
    const otherHash = c.analysisResults?.duplicate?.imageHash;
    if (!otherHash) continue;
    const distance = hammingDistance(imageHash, otherHash);
    if (!best || distance < best.distance) {
      best = { imageId: c.imageId, distance };
    }
    if (best.distance === 0) break; // exact match — short-circuit
  }

  const isDuplicate = best ? best.distance <= threshold : false;

  return {
    isDuplicate,
    imageHash,
    matchedImageId: isDuplicate ? best.imageId : null,
  };
};
