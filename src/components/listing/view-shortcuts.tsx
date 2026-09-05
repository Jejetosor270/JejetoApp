import Link from "next/link";
export function ViewShortcuts({
  pathname,
  queryString,
  field,
  options,
  defaultValue = "",
}: {
  pathname: string;
  queryString: string;
  field: string;
  options: readonly { label: string; value: string }[];
  defaultValue?: string;
}) {
  const current = new URLSearchParams(queryString);
  return (
    <nav
      aria-label="List views"
      className="flex gap-5 overflow-x-auto border-b"
    >
      {options.map((option) => {
        const query = new URLSearchParams(current);
        query.delete("page");
        if (option.value) query.set(field, option.value);
        else query.delete(field);
        const active = (current.get(field) ?? defaultValue) === option.value;
        return (
          <Link
            key={option.value}
            href={`${pathname}?${query}`}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-1 py-3 text-sm font-medium ${active ? "border-primary text-primary" : "text-muted-foreground border-transparent"}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
