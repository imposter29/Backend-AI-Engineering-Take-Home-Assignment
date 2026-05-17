/**
 * Tesseract OCR service, tuned for Indian number plates inside vehicle
 * photos (i.e. the plate is a small region of a much larger scene).
 *
 *   - One persistent worker per page-segmentation mode (init is ~1s and
 *     PSM is set at-init in tesseract.js, so we can't switch on the fly).
 *   - For close-up plate crops we additionally do an edge-density row
 *     projection to find the text band and crop to it — this rescues
 *     small, heavily JPEG-compressed plate photos where global thresholds
 *     fight reflections and bumper shadows.
 *   - Multiple preprocessing variants (soft-contrast, two binary
 *     thresholds, plain-normalise, optional band-crop) × four PSMs
 *     (sparse / single-line / single-word / single-block). We score
 *     every candidate and return the best.
 *   - Scoring rewards results that match a real plate regex over raw
 *     Tesseract confidence — otherwise high-confidence reads of badge
 *     text (e.g. "MAHINDRA") beat the actual plate.
 *   - When a candidate is one OCR-confusion swap away from a valid plate
 *     (O↔0, I↔1, S↔5, B↔8 in their digit/letter positions) we apply
 *     position-aware substitution and re-validate. Recovers the common
 *     "CGO7M3773" → "CG07M3773" miss.
 *   - Short-circuits the moment we get a confident, valid-format read.
 *
 * @param {string} storagePath
 * @returns {Promise<{ extractedText: string, confidence: number, rawText: string }>}
 */

import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { logger } from '../../utils/logger.js';
import { validateIndianPlate } from '../validation/plateValidation.service.js';

const log = logger.child({ component: 'ocr' });

const CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// Upscale small/mid-resolution photos so plate glyphs land in Tesseract's
// sweet spot (~30–50px tall). Larger inputs are left alone. Lowered from
// 1600 to keep preprocessing buffers small enough for Render's 512 MB
// free-tier RAM cap; accuracy regression is negligible on phone-sized
// inputs (already >1200 wide), and Tesseract still has enough resolution
// to recognise plate glyphs.
const TARGET_MIN_WIDTH = 1200;
// Below this Tesseract confidence, the substring extractor was matching
// hallucinated character runs that happened to fit the plate regex
// (e.g. "TN25FH8344" pulled from grille noise). Tune up to reduce false
// positives at the cost of dropping some genuine low-quality reads.
//
// Note: Tesseract reports confidence=0 when its line-level confidence
// couldn't be computed (typically on PSM SPARSE_TEXT with fragmented
// output) — that's not the same as a bad read. We still let conf=0
// through `extractPlate` if the alphanum contains a plate-shaped
// substring; the regex itself is a stronger signal than Tesseract's
// confidence in those cases.
const MIN_PLATE_CONFIDENCE = 5;
// Edge-density band detection: only crop when the densest row band is
// less than this fraction of the full image height. Full-car shots
// have edge activity spread across the whole frame and degenerate to
// "the entire image" — cropping then is a no-op, so we skip it.
const BAND_CROP_MAX_FRACTION = 0.45;

const workers = new Map();

const getWorker = (psm) => {
  if (workers.has(psm)) return workers.get(psm);

  const promise = (async () => {
    log.info('initialising tesseract worker', { psm });
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: CHAR_WHITELIST,
      tessedit_pageseg_mode: psm,
    });
    log.info('tesseract worker ready', { psm });
    return worker;
  })();

  promise.catch((err) => {
    log.error('tesseract worker init failed', { err, psm });
    workers.delete(psm);
  });

  workers.set(psm, promise);
  return promise;
};

// Edge-density horizontal projection. Plate text rows have far more
// horizontal-gradient activity than reflections or bumper shadows
// (which are mostly low-frequency intensity changes), so the densest
// contiguous row band above 50% of peak is a good plate-text guess.
// Returns null when the band degenerates to most of the image, which
// is the signal that this is a full-scene photo and a row crop won't
// help (the plate is small and localized in 2D, not just by row).
const findTextBand = async (storagePath) => {
  const { data, info } = await sharp(storagePath)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (height < 20) return null;

  const rowEdge = new Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = 1; x < width; x++) {
      sum += Math.abs(data[row + x] - data[row + x - 1]);
    }
    rowEdge[y] = sum;
  }

  // Smooth so single noisy rows don't fragment the band.
  const win = Math.max(2, Math.round(height / 50));
  const smooth = new Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    let n = 0;
    for (let k = -win; k <= win; k++) {
      const yy = y + k;
      if (yy >= 0 && yy < height) { s += rowEdge[yy]; n++; }
    }
    smooth[y] = s / n;
  }

  let max = 0;
  for (let y = 0; y < height; y++) if (smooth[y] > max) max = smooth[y];
  if (max <= 0) return null;
  const cutoff = max * 0.5;

  let bestStart = 0;
  let bestEnd = 0;
  let curStart = -1;
  for (let y = 0; y < height; y++) {
    if (smooth[y] >= cutoff) {
      if (curStart < 0) curStart = y;
    } else if (curStart >= 0) {
      if (y - curStart > bestEnd - bestStart) { bestStart = curStart; bestEnd = y; }
      curStart = -1;
    }
  }
  if (curStart >= 0 && height - curStart > bestEnd - bestStart) {
    bestStart = curStart; bestEnd = height;
  }

  const bandHeight = bestEnd - bestStart;
  if (bandHeight / height > BAND_CROP_MAX_FRACTION) return null;

  // Pad ~25% above/below so we don't clip ascenders/descenders.
  const pad = Math.round(bandHeight * 0.25);
  const top = Math.max(0, bestStart - pad);
  const bottom = Math.min(height, bestEnd + pad);
  return { left: 0, top, width, height: bottom - top };
};

const buildPreprocessVariants = async (storagePath) => {
  const meta = await sharp(storagePath).metadata();
  const scale = meta.width && meta.width < TARGET_MIN_WIDTH
    ? TARGET_MIN_WIDTH / meta.width
    : 1;
  const targetWidth = Math.round((meta.width ?? TARGET_MIN_WIDTH) * scale);

  const buildFrom = (input) => input
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalise();

  // Soft contrast for faded plates; two binary thresholds (140 hits clean
  // dark-on-white plates, 170 is gentler and rescues plates with
  // reflections that 140 floods to solid black); plain-normalised acts as
  // an "ungated" fallback that Tesseract sometimes prefers on heavily
  // JPEG-compressed inputs.
  //
  // "raw" passes the image through a PNG re-encode only — no resize, no
  // grayscale, no normalise. On clean high-resolution plate close-ups the
  // other variants over-process: normalise flattens already-maxed
  // contrast, and threshold(140/170) erases anti-aliased character edges.
  // Keeping a no-op variant in the candidate set means high-quality
  // inputs aren't degraded by the same pipeline that rescues noisy ones.
  const base = buildFrom(sharp(storagePath));
  const buffers = await Promise.all([
    sharp(storagePath).png().toBuffer(),
    base.clone().linear(1.3, -20).toBuffer(),
    base.clone().median(1).threshold(140).toBuffer(),
    base.clone().threshold(170).toBuffer(),
    base.clone().toBuffer(),
  ]);
  const variants = [
    { name: 'raw', buffer: buffers[0] },
    { name: 'contrast', buffer: buffers[1] },
    { name: 'binary140', buffer: buffers[2] },
    { name: 'binary170', buffer: buffers[3] },
    { name: 'normalised', buffer: buffers[4] },
  ];

  // Add a band-cropped variant when row-projection finds a tight text
  // band — turns a small noisy close-up into a much cleaner OCR input.
  const band = await findTextBand(storagePath).catch(() => null);
  if (band) {
    log.debug('text band detected', { band });
    const bandBase = buildFrom(sharp(storagePath).extract(band));
    const bandBuf = await bandBase.clone().threshold(170).toBuffer();
    variants.push({ name: 'band170', buffer: bandBuf });
  }

  return variants;
};

// Plate-shaped substrings inside the noisy OCR string. Mirrors the
// validator patterns but unanchored, so we can pull the plate out of a
// blob like "MAHINDRA...RJ19UC7034". We also keep a "fuzzy" variant that
// accepts the common OCR confusion characters (O for 0, I/L for 1, S for
// 5, B for 8) in digit positions — used as a second-pass extractor.
const PLATE_SUBSTRING_RE = /[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2}/;
const PLATE_SUBSTRING_FUZZY_RE = /[A-Z]{2}[\dOISLB]{1,2}[A-Z]{1,3}[\dOISLB]{4}|[\dOISLB]{2}BH[\dOISLB]{4}[A-Z]{1,2}/;

// Position-aware OCR-confusion correction. Tesseract routinely flips
// 0↔O, 1↔I/L, 5↔S, 8↔B; the correct mapping depends on whether the
// position should hold a digit or a letter, which we get from the plate
// grammar. We only apply this when the swap turns a candidate into a
// valid plate — otherwise we'd be inventing structure that isn't there.
const TO_DIGIT = { O: '0', I: '1', L: '1', S: '5', B: '8' };
const TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B' };

const fixCharByClass = (ch, wantDigit) => {
  if (wantDigit) {
    if (/\d/.test(ch)) return ch;
    return TO_DIGIT[ch] ?? ch;
  }
  if (/[A-Z]/.test(ch)) return ch;
  return TO_LETTER[ch] ?? ch;
};

// Try every STANDARD-format split for a candidate of length 9-11 and
// every BH-format split for length 9-10, applying digit/letter coercion
// position-by-position. Returns the first repaired string that the
// validator accepts. Bounded brute force — at most a few dozen splits.
const repairToPlate = (raw) => {
  if (!raw) return null;

  // STANDARD: LL D{1,2} L{1,3} D{4}  → total length 8–11
  for (let d1 = 1; d1 <= 2; d1++) {
    for (let l2 = 1; l2 <= 3; l2++) {
      const len = 2 + d1 + l2 + 4;
      for (let i = 0; i + len <= raw.length; i++) {
        const slice = raw.slice(i, i + len);
        let out = '';
        for (let j = 0; j < len; j++) {
          const isLetter = j < 2 || (j >= 2 + d1 && j < 2 + d1 + l2);
          out += fixCharByClass(slice[j], !isLetter);
        }
        if (validateIndianPlate(out).isValidPlate) return out;
      }
    }
  }

  // BH: D{2} 'BH' D{4} L{1,2} → length 9–10
  for (let l = 1; l <= 2; l++) {
    const len = 2 + 2 + 4 + l;
    for (let i = 0; i + len <= raw.length; i++) {
      const slice = raw.slice(i, i + len);
      // Positions 2,3 must literally be 'BH' — don't coerce those.
      if (slice[2] !== 'B' || slice[3] !== 'H') continue;
      let out = '';
      for (let j = 0; j < len; j++) {
        if (j === 2 || j === 3) { out += slice[j]; continue; }
        const isLetter = j >= len - l;
        out += fixCharByClass(slice[j], !isLetter);
      }
      if (validateIndianPlate(out).isValidPlate) return out;
    }
  }

  return null;
};

const extractPlate = (alphanum, confidence) => {
  if (confidence < MIN_PLATE_CONFIDENCE) return null;
  // First: clean substring match (e.g. raw blob contains a perfect plate).
  const exact = alphanum.match(PLATE_SUBSTRING_RE);
  if (exact) return exact[0];
  // Second: fuzzy substring → position-aware repair. This recovers reads
  // like "CGO7M3773" where Tesseract picked an O over a 0 in a digit slot.
  const fuzzy = alphanum.match(PLATE_SUBSTRING_FUZZY_RE);
  if (fuzzy) {
    const repaired = repairToPlate(fuzzy[0]);
    if (repaired) return repaired;
  }
  // Third: try repair over the full alphanum string — catches cases where
  // the fuzzy substring failed to anchor but a valid plate is still in
  // there (e.g. leading IND-emblem noise that splits the prefix letters).
  const repaired = repairToPlate(alphanum);
  if (repaired) return repaired;
  return null;
};

const recognise = async (buffer, psm) => {
  const worker = await getWorker(psm);
  const { data } = await worker.recognize(buffer);
  const rawText = (data?.text ?? '').trim();
  const alphanum = rawText.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const confidence = Math.round(data?.confidence ?? 0);
  const extracted = extractPlate(alphanum, confidence);
  return { extractedText: extracted ?? alphanum, confidence, rawText };
};

// Plates inside vehicle photos are sparse text in a busy scene, so PSM 11
// finds them best. PSM 7 (single line) is the fallback for tight crops
// where the plate fills the frame.
//
// We previously kept four persistent PSM workers (SPARSE / SINGLE_LINE /
// SINGLE_WORD / SINGLE_BLOCK) for marginal accuracy gains on edge cases.
// Each worker loads the ~50 MB English language model and stays
// resident, which on Render's 512 MB free tier crowded out the
// preprocessing/Sharp buffers and OOM-killed the process under load.
// Dropping to two PSMs cuts ~100 MB of always-resident memory; the
// remaining two cover the dominant cases (scene photos + tight crops).
const PSM_MODES = [PSM.SPARSE_TEXT, PSM.SINGLE_LINE];

const scoreCandidate = (candidate) => {
  const { extractedText, confidence } = candidate;
  if (!extractedText) return -1;
  // Reward results that look like a real Indian plate; otherwise fall back
  // to length + raw confidence. The length bonus stops short fragmentary
  // reads with high local confidence (e.g. one variant returning just "K"
  // at conf 44 from a band-crop sliver) from beating substantial
  // partial-plate reads where Tesseract couldn't compute a line-level
  // confidence (conf=0 + "1122BH6517"). Capped at 12 chars so noisy long
  // reads can't run away from shorter, cleaner plate reads.
  const { isValidPlate } = validateIndianPlate(extractedText);
  const lengthBonus = Math.min(extractedText.length, 12) * 10;
  return (isValidPlate ? 1000 : 0) + lengthBonus + confidence;
};

export const runOcr = async (storagePath) => {
  const variants = await buildPreprocessVariants(storagePath);

  let best = { extractedText: '', confidence: 0, rawText: '' };
  let bestScore = -1;

  for (const variant of variants) {
    for (const psm of PSM_MODES) {
      const candidate = await recognise(variant.buffer, psm);
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
      // Short-circuit as soon as we have a confidently-valid plate read.
      if (validateIndianPlate(candidate.extractedText).isValidPlate
        && candidate.confidence >= 60) {
        return candidate;
      }
    }
  }

  return best;
};

/** Dispose all Tesseract workers. Wire into process shutdown handlers. */
export const disposeOcr = async () => {
  const promises = Array.from(workers.values());
  workers.clear();
  await Promise.all(
    promises.map(async (p) => {
      try {
        const worker = await p;
        await worker.terminate();
      } catch (err) {
        log.warn('error terminating tesseract worker', { err });
      }
    }),
  );
  if (promises.length) log.info('tesseract workers terminated', { count: promises.length });
};
