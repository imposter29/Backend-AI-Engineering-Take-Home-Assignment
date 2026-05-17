/**
 * Loading state used while we're polling for a terminal status.
 * Mirrors the eventual grid layout so the page doesn't reflow when
 * results arrive.
 */

const SkeletonLine = ({ width = 'w-2/3' }) => (
  <div className={`skeleton mb-2 h-3 ${width}`} />
);

const SkeletonCard = () => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-4 w-14 rounded-full" />
    </div>
    <SkeletonLine />
    <SkeletonLine width="w-1/2" />
  </div>
);

export const ResultsSkeleton = () => {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SkeletonLine width="w-3/4" />
          <SkeletonLine width="w-2/3" />
          <SkeletonLine width="w-2/3" />
          <SkeletonLine width="w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
};

export default ResultsSkeleton;
