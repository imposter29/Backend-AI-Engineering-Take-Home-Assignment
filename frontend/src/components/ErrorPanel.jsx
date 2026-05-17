/**
 * User-facing error surface.
 *
 * Receives the normalised error thrown by the api/* layer (carrying
 * `.status`, `.code`, `.requestId` when available) and shapes a
 * compact message + a retry CTA.
 */

export const ErrorPanel = ({ error, onRetry }) => {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-5 w-5 text-rose-600"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-rose-800">
            {error.message || 'Something went wrong'}
          </p>
          <p className="mt-0.5 text-xs text-rose-600">
            {error.code && <span>code: {error.code}</span>}
            {error.status ? <span> · status: {error.status}</span> : null}
            {error.requestId && (
              <span> · req: <span className="font-mono">{error.requestId.slice(0, 8)}</span></span>
            )}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorPanel;
