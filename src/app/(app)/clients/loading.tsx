export default function ClientsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading view"
      role="status"
      className="bg-card h-72 animate-pulse rounded-lg border"
    />
  );
}
