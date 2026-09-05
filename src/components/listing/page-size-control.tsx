"use client";
import { useRouter } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "@/domain/listing/validation";
export function PageSizeControl({
  pageSize,
  pathname,
  queryString,
}: {
  pageSize: number;
  pathname: string;
  queryString: string;
}) {
  const router = useRouter();
  return (
    <label className="text-muted-foreground flex items-center gap-2">
      Rows per page
      <select
        value={pageSize}
        className="bg-background text-foreground h-8 rounded-md border px-2"
        onChange={(event) => {
          const query = new URLSearchParams(queryString);
          query.set("pageSize", event.target.value);
          query.delete("page");
          router.push(`${pathname}?${query}`);
        }}
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
