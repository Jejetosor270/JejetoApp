export function fieldErrorMap(
  issues: readonly { message: string; path: PropertyKey[] }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    if (path && errors[path] === undefined) errors[path] = issue.message;
  }
  return errors;
}
