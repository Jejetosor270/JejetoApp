import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { AppliedFilters } from "@/components/listing/applied-filters";
import { SlidersHorizontal } from "lucide-react";

/** A single GET form keeps the existing validated query contract intact. */
export function FilterBar({ children }: { children: ReactNode }) {
  function flatten(nodes: ReactNode): ReactNode[] {
    return Children.toArray(nodes).flatMap((node) =>
      isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
        ? flatten(node.props.children)
        : [node],
    );
  }
  const fields = flatten(children);
  const labels: Record<string, string> = {};
  for (const node of fields) {
    if (
      !isValidElement<{ label?: string; children?: ReactNode }>(node) ||
      !node.props.label
    )
      continue;
    for (const control of flatten(node.props.children)) {
      if (
        !isValidElement<{
          name?: string;
          defaultValue?: string;
          children?: ReactNode;
        }>(control) ||
        !control.props.name ||
        !control.props.defaultValue ||
        ["sort", "direction", "sortDirection"].includes(control.props.name)
      )
        continue;
      const option = flatten(control.props.children).find(
        (child) =>
          isValidElement<{ value?: string }>(child) &&
          child.props.value === control.props.defaultValue,
      );
      const value = isValidElement<{ children?: ReactNode }>(option)
        ? flatten(option.props.children)
            .filter(
              (child) => typeof child === "string" || typeof child === "number",
            )
            .join("")
        : control.props.defaultValue;
      labels[control.props.name] = `${node.props.label}: ${value}`;
    }
  }
  const primary: ReactNode[] = [];
  const advanced: ReactNode[] = [];
  const actions: ReactNode[] = [];
  const hidden: ReactNode[] = [];
  for (const field of fields) {
    if (!isValidElement<{ label?: string; type?: string }>(field)) {
      actions.push(field);
      continue;
    }
    if (
      field.props.type === "submit" ||
      field.type === "button" ||
      (isValidElement<{ href?: string }>(field) &&
        field.props.href !== undefined)
    ) {
      actions.push(field);
      continue;
    }
    if (field.props.type === "hidden") {
      hidden.push(field);
      continue;
    }
    const label = field.props.label;
    if (
      label &&
      !["Sort by", "Sort direction", "Direction", "Rows per page"].includes(
        label,
      ) &&
      primary.length < 3
    )
      primary.push(field);
    else advanced.push(field);
  }
  return (
    <form method="get" data-draft-guard="off" className="space-y-3">
      {hidden}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
          {primary}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <AppliedFilters labels={labels} />
      {advanced.length > 0 && (
        <details className="group">
          <summary className="text-muted-foreground inline-flex min-h-8 items-center gap-2 rounded-md text-xs font-medium">
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            More filters & sorting
          </summary>
          <div className="bg-muted/30 mt-2 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-4">
            {advanced}
          </div>
        </details>
      )}
    </form>
  );
}
