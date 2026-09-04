import type { ReactNode } from "react";

export const filterControlClassName =
  "border-input bg-background h-9 w-full min-w-0 rounded-lg border px-3 text-sm";

export function FilterField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="text-muted-foreground grid min-w-0 gap-1 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
