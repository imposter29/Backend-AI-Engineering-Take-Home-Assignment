/**
 * Drag-and-drop + click-to-pick file selector.
 *
 * Validates client-side BEFORE the upload starts:
 *   - MIME must be one of the allowed image types.
 *   - Size must fit MAX_UPLOAD_BYTES (mirrors server limit).
 *
 * These checks are duplicated server-side — they exist here purely to
 * give the user a fast, friendly error instead of waiting for a 4xx
 * round-trip.
 */

import { useCallback, useRef, useState } from 'react';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const Dropzone = ({ onFile, disabled }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleFile = useCallback(
    (file) => {
      setLocalError(null);
      if (!file) return;
      if (!ALLOWED.includes(file.type)) {
        setLocalError(`Unsupported file type: ${file.type || 'unknown'}`);
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError(`File too large (${formatBytes(file.size)} > 10 MB)`);
        return;
      }
      onFile?.(file);
    },
    [onFile],
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onPick = (e) => {
    handleFile(e.target.files?.[0]);
    // Reset so picking the same file again still fires the event.
    e.target.value = '';
  };

  return (
    <div>
      <label
        htmlFor="image-input"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition',
          dragOver
            ? 'border-slate-900 bg-slate-50'
            : 'border-slate-300 bg-white hover:border-slate-400',
          disabled ? 'cursor-not-allowed opacity-60' : '',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-3 h-10 w-10 text-slate-400"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm font-medium text-slate-900">
          Drop an image here, or <span className="underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          JPEG · PNG · WebP &nbsp;·&nbsp; up to 10 MB
        </p>
        <input
          ref={inputRef}
          id="image-input"
          type="file"
          accept={ALLOWED.join(',')}
          onChange={onPick}
          disabled={disabled}
          className="hidden"
        />
      </label>
      {localError && (
        <p className="mt-2 text-xs text-rose-600">{localError}</p>
      )}
    </div>
  );
};

export default Dropzone;
