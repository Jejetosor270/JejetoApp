import { cn } from "@/lib/utils";

export const tabListClassName =
  "bg-card flex min-w-0 gap-1 overflow-x-auto rounded-lg border p-1";

export function tabClassName(active: boolean) {
  return cn(
    "inline-flex min-h-9 shrink-0 items-center justify-center rounded-md px-4 text-[13px] font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    active
      ? "bg-accent text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}
