export default function ProjectLoading() {
  return (
    <div
      role="status"
      aria-label="Loading Project"
      aria-busy="true"
      className="space-y-6"
    >
      <p className="text-muted-foreground text-sm">
        Loading Project financials and related records…
      </p>
      <div className="bg-muted h-16 animate-pulse rounded-lg" />
      <div className="bg-muted h-10 w-48 animate-pulse rounded-lg" />
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="record-surface grid gap-4 sm:grid-cols-3"
        >
          {[0, 1, 2].map((cell) => (
            <div key={cell} className="bg-muted h-16 animate-pulse rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}
