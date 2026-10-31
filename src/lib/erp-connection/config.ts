import "server-only";

/** Explicit canonical origin; never derive trusted links from request headers. */
export function getErpMcpOrigin(): string | null {
  const value = process.env.ERP_MCP_ORIGIN?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
