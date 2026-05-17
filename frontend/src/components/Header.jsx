/**
 * Top bar. Intentionally minimal — product name + a "what is this?"
 * tagline. Status chips and per-job state live further down so the
 * header stays calm.
 */

export const Header = () => {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M3 16 L9 8 L13 13 L17 9 L21 16" />
              <circle cx="17" cy="6" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Media Pipeline
            </h1>
            <p className="text-xs text-slate-500">
              Image analysis · OCR · plate validation · duplicate detection
            </p>
          </div>
        </div>
        <a
          href="https://github.com/imposter29/Backend-AI-Engineering-Take-Home-Assignment"
          target="_blank"
          rel="noreferrer"
          className="hidden text-xs font-medium text-slate-500 hover:text-slate-900 sm:block"
        >
          v1
        </a>
      </div>
    </header>
  );
};

export default Header;
