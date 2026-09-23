/** Shared behavior styles; each domain table keeps its own columns and row component. */
export const tableContainerClassName =
  "bg-card overflow-hidden rounded-lg border";
export const tableHeaderClassName =
  "bg-muted text-muted-foreground sticky top-0 z-10 border-b text-xs [&>tr>th]:px-3 [&>tr>th]:py-2.5 [&>tr>th]:font-medium";
export const tableRowClassName =
  "hover:bg-muted/50 focus-within:bg-accent/40 has-[:checked]:bg-accent/60 align-top [&>td]:px-3 [&>td]:py-2.5";

/** Body-level styling also covers domain-owned rows without replacing their behavior. */
export const tableBodyClassName =
  "divide-y [&>tr]:align-top [&>tr:hover]:bg-muted/50 [&>tr:focus-within]:bg-accent/40 [&>tr:has(:checked)]:bg-accent/60 [&>tr>td]:px-3 [&>tr>td]:py-2.5 [&>tr>th]:px-3 [&>tr>th]:py-2.5";
