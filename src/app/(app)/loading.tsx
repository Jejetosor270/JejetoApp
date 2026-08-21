import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.8fr)]">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
