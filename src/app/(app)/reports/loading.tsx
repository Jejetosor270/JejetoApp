export default function ReportsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading reports">
      <div className="bg-muted h-20 animate-pulse rounded-lg" />
      <div className="bg-muted h-12 animate-pulse rounded-lg" />
      <div className="bg-muted h-72 animate-pulse rounded-lg" />
    </div>
  );
}
