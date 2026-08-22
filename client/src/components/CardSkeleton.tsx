/*
 * Matches the shape of the card it stands in for, so the layout does not jump
 * when the real screen loads. Beats a bare spinner in the same spot.
 */
export function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 elevation-low"
    >
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="mx-auto h-6 w-40 rounded bg-muted" />
          <div className="mx-auto h-4 w-56 rounded bg-muted/70" />
        </div>
        <div className="h-40 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-9 rounded-md bg-muted" />
          <div className="h-11 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}
