const presentationKeys = new Set([
  "view",
  "tab",
  "sort",
  "direction",
  "sortDirection",
  "page",
  "pageSize",
  "portfolioView",
]);

export function hasListFilters(params: URLSearchParams) {
  return [...params.entries()].some(
    ([key, value]) => value && !presentationKeys.has(key),
  );
}

/** Reset filters and pagination without leaving the current workspace view. */
export function clearFiltersHref(pathname: string, params: URLSearchParams) {
  const query = new URLSearchParams(params);
  for (const key of [...query.keys()]) {
    if (!presentationKeys.has(key) || key === "page") query.delete(key);
  }
  return query.size ? `${pathname}?${query}` : pathname;
}
