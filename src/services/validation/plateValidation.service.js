/**
 * Indian number-plate format validator.
 *
 * Two formats are currently in circulation:
 *
 *   STANDARD (state series)
 *     2 letters (state code) + 1–2 digits (RTO district) +
 *     1–3 letters (series) + 4 digits (unique number)
 *     e.g.  KA01AB1234,  MH12DE0001,  DL8C12345,  TN22A4567
 *
 *   BH_SERIES (Bharat / inter-state)
 *     2 digits (registration year) + 'BH' +
 *     4 digits (unique number) + 1–2 letters (series)
 *     e.g.  21BH1234AA, 22BH9999A
 *
 * The OCR upstream strips everything that isn't A–Z/0–9, so we
 * normalise the same way before matching. This is pure string work —
 * synchronous, trivially unit-testable.
 *
 * @param {string} ocrText
 * @returns {{ isValidPlate: boolean, matchedPattern: 'STANDARD'|'BH_SERIES'|null }}
 */

const PATTERNS = [
  // STANDARD must come first — its prefix is more selective than BH.
  { name: 'STANDARD', regex: /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/ },
  { name: 'BH_SERIES', regex: /^\d{2}BH\d{4}[A-Z]{1,2}$/ },
];

const normalise = (text) =>
  (text ?? '')
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const validateIndianPlate = (ocrText) => {
  const normalised = normalise(ocrText);
  if (!normalised) {
    return { isValidPlate: false, matchedPattern: null };
  }

  for (const { name, regex } of PATTERNS) {
    if (regex.test(normalised)) {
      return { isValidPlate: true, matchedPattern: name };
    }
  }
  return { isValidPlate: false, matchedPattern: null };
};
