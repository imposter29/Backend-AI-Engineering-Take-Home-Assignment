/**
 * Pill-shaped lifecycle indicator.
 * `pending` and `processing` get an animated dot so it's visually
 * obvious that something is in flight.
 */

const VARIANTS = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
};

const DOT_COLORS = {
  pending: 'bg-amber-500',
  processing: 'bg-sky-500',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500',
};

export const StatusBadge = ({ status }) => {
  const key = VARIANTS[status] ? status : 'pending';
  const animate = key === 'pending' || key === 'processing';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${VARIANTS[key]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {animate && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${DOT_COLORS[key]}`}
          />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOT_COLORS[key]}`}
        />
      </span>
      {status || 'unknown'}
    </span>
  );
};

export default StatusBadge;
