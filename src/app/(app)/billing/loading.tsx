import { Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading view"
      role="status"
      className="space-y-4"
    >
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
