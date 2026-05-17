/**
 * Left-hand column of the dashboard.
 *
 *  - Renders the dropzone when no file has been picked.
 *  - Shows a local image preview the moment a file is selected (using
 *    URL.createObjectURL — revoked on unmount/swap to avoid leaks).
 *  - Shows the upload progress bar while the file is being POSTed.
 *  - Once a job is in flight, exposes a "process another" reset.
 */

import { useEffect, useState } from 'react';
import Dropzone from './Dropzone.jsx';
import StatusBadge from './StatusBadge.jsx';

const formatBytes = (n) => {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const UploadPanel = ({
  phase,
  uploadProgress,
  status,
  imageId,
  onUpload,
  onReset,
}) => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = (next) => {
    setFile(next);
    onUpload?.(next);
  };

  const handleReset = () => {
    setFile(null);
    onReset?.();
  };

  const idle = phase === 'idle';
  const uploading = phase === 'uploading';
  const polling = phase === 'polling';
  const done = phase === 'done';
  const errored = phase === 'error';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Upload</h2>
        {(polling || done || errored) && (
          <StatusBadge status={errored ? 'failed' : status} />
        )}
      </div>

      {idle && <Dropzone onFile={handleFile} />}

      {!idle && (
        <div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={file?.name || 'uploaded'}
                className="h-64 w-full object-contain"
              />
            ) : (
              <div className="h-64 w-full" />
            )}
          </div>

          <div className="mt-4 space-y-1 text-xs text-slate-600">
            {file?.name && (
              <div className="flex justify-between">
                <span className="text-slate-500">file</span>
                <span className="truncate pl-4 font-medium text-slate-900">
                  {file.name}
                </span>
              </div>
            )}
            {file?.size != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">size</span>
                <span className="font-medium text-slate-900">
                  {formatBytes(file.size)}
                </span>
              </div>
            )}
            {imageId && (
              <div className="flex justify-between">
                <span className="text-slate-500">image id</span>
                <span className="font-mono text-[11px] text-slate-900">
                  {imageId.slice(0, 8)}…{imageId.slice(-4)}
                </span>
              </div>
            )}
          </div>

          {uploading && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>uploading</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-slate-900 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {(done || errored) && (
            <button
              type="button"
              onClick={handleReset}
              className="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Process another image
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadPanel;
