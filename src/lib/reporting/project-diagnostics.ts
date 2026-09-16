import "server-only";

/** Safe stage diagnostics: no customer names, query parameters, SQL or amounts. */
export async function projectRead<T>(
  stage: string,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const value = error && typeof error === "object" ? error : {};
    const code =
      "code" in value &&
      typeof value.code === "string" &&
      /^[A-Z0-9]{4,8}$/.test(value.code)
        ? value.code
        : undefined;
    const digest =
      "digest" in value &&
      typeof value.digest === "string" &&
      /^\d+$/.test(value.digest)
        ? value.digest
        : undefined;
    console.error("Project detail read failed", {
      stage,
      errorType: error instanceof Error ? error.name : "UnknownError",
      code,
      digest,
    });
    throw error;
  }
}
