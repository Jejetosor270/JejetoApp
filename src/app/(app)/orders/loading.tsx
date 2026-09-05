export default function OrdersLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading view"
      role="status"
      className="bg-card h-80 animate-pulse rounded-lg border"
    />
  );
}
