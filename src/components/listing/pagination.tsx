import Link from "next/link";

import { PageSizeControl } from "@/components/listing/page-size-control";

function pageHref(pathname: string, queryString: string, page: number): string {
  const query = new URLSearchParams(queryString);
  query.set("page", String(page));
  return `${pathname}?${query.toString()}`;
}

export function Pagination({
  page,
  pageSize,
  pathname,
  queryString,
  selectionIsPageScoped = false,
  total,
}: {
  page: number;
  pageSize: number;
  pathname: string;
  queryString: string;
  selectionIsPageScoped?: boolean;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(safePage * pageSize, total);
  return (
    <footer className="bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
      <p className="text-muted-foreground">
        {first}–{last} of {total}.
        {selectionIsPageScoped ? " Selection applies to this page only." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeControl
          pageSize={pageSize}
          pathname={pathname}
          queryString={queryString}
        />
        <span className="text-muted-foreground">
          Page {safePage} of {pageCount}
        </span>
        {safePage > 1 ? (
          <Link
            className="border-input bg-background rounded-md border px-2.5 py-1.5 font-medium"
            href={pageHref(pathname, queryString, safePage - 1)}
          >
            Previous
          </Link>
        ) : (
          <span className="text-muted-foreground border-input rounded-md border px-2.5 py-1.5 opacity-50">
            Previous
          </span>
        )}
        {safePage < pageCount ? (
          <Link
            className="border-input bg-background rounded-md border px-2.5 py-1.5 font-medium"
            href={pageHref(pathname, queryString, safePage + 1)}
          >
            Next
          </Link>
        ) : (
          <span className="text-muted-foreground border-input rounded-md border px-2.5 py-1.5 opacity-50">
            Next
          </span>
        )}
      </div>
    </footer>
  );
}

/** Preserve the filter form's existing page-size query; the visible control lives in the footer. */
export function PageSizeField({ value }: { value: number }) {
  return <input name="pageSize" type="hidden" value={value} />;
}
