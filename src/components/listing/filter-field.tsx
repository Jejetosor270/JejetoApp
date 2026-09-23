import type { ReactNode } from "react";
import { controlVariants } from "@/components/forms/control-styles";

export const filterControlClassName = controlVariants();

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
