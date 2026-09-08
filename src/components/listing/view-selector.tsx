/** Secondary presentation choices, not competing workspaces. GET preserves scoped filters. */
export function ViewSelector({
  pathname,
  queryString,
  field,
  label = "Columns",
  options,
  defaultValue = "",
}: {
  pathname: string;
  queryString: string;
  field: string;
  label?: string;
  options: readonly { label: string; value: string }[];
  defaultValue?: string;
}) {
  const query = new URLSearchParams(queryString);
  const value = query.get(field) ?? defaultValue;
  return (
    <form
      action={pathname}
      method="get"
      data-draft-guard="off"
      className="flex flex-wrap items-end gap-2"
    >
      {Array.from(query.entries())
        .filter(([key]) => key !== field && key !== "page")
        .map(([key, value], index) => (
          <input
            key={`${key}-${index}`}
            type="hidden"
            name={key}
            value={value}
          />
        ))}
      <label className="grid gap-1 text-xs font-medium">
        {label}
        <select
          name={field}
          defaultValue={
            options.some((option) => option.value === value)
              ? value
              : defaultValue
          }
          className="border-input bg-background h-9 max-w-full rounded-lg border px-3 text-sm"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
      >
        Apply
      </button>
    </form>
  );
}
