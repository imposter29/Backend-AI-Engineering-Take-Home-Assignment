/**
 * Single-page dashboard. Two columns on large screens:
 *
 *   [ UploadPanel ]   [ Results / Skeleton / Empty ]
 *
 * On narrow screens the columns stack. The page owns no state of its
 * own — it just routes the `useImageProcessing` hook into the
 * appropriate child components and renders an error band on top when
 * something fails.
 */

import UploadPanel from '../components/UploadPanel.jsx';
import ResultsGrid from '../components/ResultsGrid.jsx';
import ResultsSkeleton from '../components/ResultsSkeleton.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';
import useImageProcessing from '../hooks/useImageProcessing.js';

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 text-slate-400"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
    <p className="text-sm font-medium text-slate-700">No results yet</p>
    <p className="mt-1 max-w-xs text-xs text-slate-500">
      Upload an image to run blur, brightness, OCR, plate validation and
      duplicate detection.
    </p>
  </div>
);

export const DashboardPage = () => {
  const flow = useImageProcessing();
  const { phase, uploadProgress, status, imageId, results, error, upload, reset } = flow;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {error && (
        <div className="mb-6">
          <ErrorPanel error={error} onRetry={reset} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <UploadPanel
          phase={phase}
          uploadProgress={uploadProgress}
          status={status}
          imageId={imageId}
          onUpload={upload}
          onReset={reset}
        />

        <section>
          {phase === 'idle' && <EmptyState />}
          {(phase === 'uploading' || phase === 'polling') && <ResultsSkeleton />}
          {phase === 'done' && results && <ResultsGrid payload={results} />}
          {phase === 'error' && !results && <EmptyState />}
        </section>
      </div>

      <footer className="mt-10 text-center text-xs text-slate-400">
        Polling status every 1.5s · pipeline:
        dimensions → blur → brightness → ocr → plate → duplicate
      </footer>
    </main>
  );
};

export default DashboardPage;
