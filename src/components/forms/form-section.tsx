import type { ReactNode } from "react";

/** Field columns follow the editor's available width, not the viewport. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {description ? (
        <p className="text-muted-foreground text-xs leading-5">{description}</p>
      ) : null}
      <div className="grid items-start gap-4 @min-[28rem]:grid-cols-2 [&>label]:min-w-0">
        {children}
      </div>
    </fieldset>
  );
}
