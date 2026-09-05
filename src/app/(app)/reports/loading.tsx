export default function ReportsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading view"
      role="status"
      className="space-y-5"
    >
      <div className="bg-muted h-20 animate-pulse rounded-lg" />
      <div className="bg-muted h-12 animate-pulse rounded-lg" />
      <div className="bg-muted h-72 animate-pulse rounded-lg" />
    </div>
  );
}
