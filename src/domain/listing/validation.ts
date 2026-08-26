import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export interface PageInput {
  page: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
}

export function firstQueryValue(
  params: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = params[name];
  return typeof value === "string" ? value : undefined;
}

export function parsePageInput(
  params: Record<string, string | string[] | undefined>,
): PageInput {
  const page = z.coerce
    .number()
    .int()
    .positive()
    .catch(1)
    .parse(firstQueryValue(params, "page"));
  const pageSize = z.coerce
    .number()
    .catch(DEFAULT_PAGE_SIZE)
    .transform((value) =>
      PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
        ? (value as (typeof PAGE_SIZE_OPTIONS)[number])
        : DEFAULT_PAGE_SIZE,
    )
    .parse(firstQueryValue(params, "pageSize"));
  return { page, pageSize };
}

export function selectedValue<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.find((item) => item === value);
}

export function parseSort<T extends string>(
  values: readonly T[],
  value: string | undefined,
  fallback: T,
): T {
  return selectedValue(values, value) ?? fallback;
}

export function parseSortDirection(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

export function optionalUuid(value: string | undefined): string | undefined {
  return z.uuid().safeParse(value).success ? value : undefined;
}

export function paginationSkip(input: PageInput): number {
  return (input.page - 1) * input.pageSize;
}

export function queryStringFromParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  return query.toString();
}
