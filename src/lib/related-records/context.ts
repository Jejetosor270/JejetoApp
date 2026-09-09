/** Historical reporting currency must survive removal of its supplying parent. */
export function retainedCurrency(
  current: string | null | undefined,
  detached: string | null | undefined,
): string {
  const currency = current ?? detached;
  if (!currency) throw new Error("Missing retained reporting currency.");
  return currency;
}

export function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
