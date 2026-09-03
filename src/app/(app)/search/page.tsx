import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { globalSearchQuerySchema } from "@/domain/search/validation";
import { requireUser } from "@/lib/auth/current-user";
import { globalSearch } from "@/lib/search/global-search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const parsed = globalSearchQuerySchema.safeParse(params.q ?? "");
  const results = parsed.success ? await globalSearch(parsed.data) : [];
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Workspace
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Global search
        </h1>
      </header>
      <form className="flex max-w-2xl gap-2">
        <input
          aria-label="Search the ERP"
          autoFocus
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
          defaultValue={params.q ?? ""}
          name="q"
          placeholder="Project, Building, Client, Supplier, or Supplier Order"
        />
        <button
          className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium"
          type="submit"
        >
          <Search className="size-4" /> Search
        </button>
      </form>
      {!parsed.success && params.q ? (
        <p className="text-destructive text-sm">
          Enter between 2 and 100 characters.
        </p>
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {parsed.success
            ? `${results.length} result${results.length === 1 ? "" : "s"} for “${parsed.data}”`
            : "Search results"}
        </div>
        <ul className="divide-y">
          {results.map((result) => (
            <li key={`${result.type}-${result.id}`}>
              <Link
                className="hover:bg-muted/25 flex items-start gap-3 px-4 py-3"
                href={result.href}
              >
                <Badge variant="outline">{result.type}</Badge>
                <span>
                  <span className="block text-sm font-medium">
                    {result.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {result.context}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {parsed.success && results.length === 0 ? (
            <li className="text-muted-foreground px-4 py-10 text-center text-sm">
              No matching operational records.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
