/**
 * Generic card used by every analyzer panel.
 *
 *   ┌────────────────────────────────────┐
 *   │ <title>                <verdict>   │
 *   ├────────────────────────────────────┤
 *   │ <children>                          │
 *   └────────────────────────────────────┘
 *
 * `verdict` is a small status pill (e.g. "sharp", "blurry") rendered
 * to the right of the title; pass `tone` to colour it.
 */

const TONES = {
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  negative: 'bg-rose-50 text-rose-700 ring-rose-600/10',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-600/10',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/10',
};

export const ResultCard = ({ title, verdict, tone = 'neutral', children }) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {verdict && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone] || TONES.neutral}`}
          >
            {verdict}
          </span>
        )}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
};

/** Two-column key/value row used inside cards. */
export const Field = ({ label, value, mono }) => (
  <div className="flex items-baseline justify-between py-1 text-xs">
    <span className="text-slate-500">{label}</span>
    <span
      className={`font-medium text-slate-900 ${mono ? 'font-mono text-[11px]' : ''}`}
    >
      {value ?? '—'}
    </span>
  </div>
);

export default ResultCard;
