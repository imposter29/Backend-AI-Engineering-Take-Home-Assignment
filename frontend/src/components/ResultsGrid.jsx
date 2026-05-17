/**
 * Renders the six analyzer panels in a responsive grid.
 *
 * Each card reads its slice of `analysisResults` defensively — if an
 * analyzer failed inline (`{ error: '...' }`), the card surfaces the
 * error instead of pretending the data is missing. This mirrors the
 * worker contract where one analyzer failure does NOT poison the
 * whole pipeline.
 */

import ResultCard, { Field } from './ResultCard.jsx';

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { hour12: false }) : '—';

/**
 * Stacked label/value cell used in the header strip. Unlike `Field`
 * (row-flex), this puts the label above the value so 4 narrow columns
 * never smash labels into values when the value text wraps.
 */
const MetaCell = ({ label, value, mono }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-wide text-slate-400">
      {label}
    </span>
    <span
      className={`truncate text-xs font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}
      title={typeof value === 'string' ? value : undefined}
    >
      {value ?? '—'}
    </span>
  </div>
);

const ErrorBody = ({ message }) => (
  <p className="text-xs text-rose-600">analyzer failed: {message}</p>
);

const BlurCard = ({ data }) => {
  if (data?.error) return <ResultCard title="Blur"><ErrorBody message={data.error} /></ResultCard>;
  const isBlurry = data?.isBlurry === true;
  return (
    <ResultCard
      title="Blur"
      verdict={isBlurry ? 'blurry' : 'sharp'}
      tone={isBlurry ? 'negative' : 'positive'}
    >
      <Field label="Laplacian variance" value={data?.blurScore ?? '—'} />
      <Field label="threshold" value={data?.threshold ?? '—'} />
    </ResultCard>
  );
};

const BrightnessCard = ({ data }) => {
  if (data?.error) return <ResultCard title="Brightness"><ErrorBody message={data.error} /></ResultCard>;
  const level = data?.brightnessLevel ?? 'unknown';
  const tone = level === 'normal' ? 'positive' : level === 'dark' || level === 'overexposed' ? 'warn' : 'neutral';
  return (
    <ResultCard title="Brightness" verdict={level} tone={tone}>
      <Field label="mean intensity" value={data?.brightnessScore ?? '—'} />
      <Field label="range" value="0–255" />
    </ResultCard>
  );
};

const DimensionsCard = ({ data }) => {
  if (data?.error) return <ResultCard title="Dimensions"><ErrorBody message={data.error} /></ResultCard>;
  const valid = data?.validDimensions === true;
  return (
    <ResultCard
      title="Dimensions"
      verdict={valid ? 'valid' : 'too small'}
      tone={valid ? 'positive' : 'negative'}
    >
      <Field
        label="resolution"
        value={data?.width && data?.height ? `${data.width} × ${data.height}` : '—'}
      />
      <Field label="min required" value="150 × 150" />
    </ResultCard>
  );
};

const OcrCard = ({ data }) => {
  if (data?.error) return <ResultCard title="OCR"><ErrorBody message={data.error} /></ResultCard>;
  const text = data?.extractedText || '';
  return (
    <ResultCard
      title="OCR"
      verdict={text ? `${data?.confidence ?? 0}% conf` : 'no text'}
      tone={text ? 'positive' : 'neutral'}
    >
      <div className="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-900">
        {text || <span className="text-slate-400">(empty)</span>}
      </div>
      <Field label="confidence" value={`${data?.confidence ?? 0}%`} />
    </ResultCard>
  );
};

const PlateCard = ({ data }) => {
  if (data?.error) return <ResultCard title="Plate"><ErrorBody message={data.error} /></ResultCard>;
  const valid = data?.isValidPlate === true;
  return (
    <ResultCard
      title="Plate validation"
      verdict={valid ? 'valid' : 'no match'}
      tone={valid ? 'positive' : 'neutral'}
    >
      <Field label="pattern" value={data?.matchedPattern || '—'} />
      <Field label="format" value="Indian (STANDARD / BH)" />
    </ResultCard>
  );
};

const DuplicateCard = ({ data }) => {
  if (data?.error) return <ResultCard title="Duplicate"><ErrorBody message={data.error} /></ResultCard>;
  const isDup = data?.isDuplicate === true;
  return (
    <ResultCard
      title="Duplicate detection"
      verdict={isDup ? 'duplicate' : 'unique'}
      tone={isDup ? 'warn' : 'positive'}
    >
      <Field label="hash" value={data?.imageHash || '—'} mono />
      <Field
        label="matched image"
        value={data?.matchedImageId ? `${data.matchedImageId.slice(0, 8)}…` : '—'}
        mono
      />
    </ResultCard>
  );
};

export const ResultsGrid = ({ payload }) => {
  const a = payload?.analysisResults ?? {};

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
          <MetaCell label="status" value={payload?.status} />
          <MetaCell label="uploaded" value={fmtDate(payload?.uploadedAt)} />
          <MetaCell label="processed" value={fmtDate(payload?.processedAt)} />
          <MetaCell
            label="image id"
            value={payload?.imageId ? `${payload.imageId.slice(0, 8)}…` : '—'}
            mono
          />
        </div>
      </div>

      {payload?.status === 'failed' && payload?.failureReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span className="font-medium">Processing failed: </span>
          {payload.failureReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BlurCard data={a.blur} />
        <BrightnessCard data={a.brightness} />
        <DimensionsCard data={a.dimensions} />
        <OcrCard data={a.ocr} />
        <PlateCard data={a.plate} />
        <DuplicateCard data={a.duplicate} />
      </div>
    </div>
  );
};

export default ResultsGrid;
