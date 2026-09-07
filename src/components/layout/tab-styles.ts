import { cn } from "@/lib/utils";

export const tabListClassName = "flex min-w-0 gap-5 overflow-x-auto border-b";

export function tabClassName(active: boolean) {
  return cn(
    "inline-flex min-h-11 shrink-0 items-center border-b-2 px-1 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    active
      ? "border-primary text-primary"
      : "text-muted-foreground hover:text-foreground border-transparent",
  );
}
