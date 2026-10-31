export class ErpReadToolError extends Error {
  constructor(
    readonly code: "INVALID" | "NOT_FOUND" | "UNKNOWN_TOOL",
    message: string,
  ) {
    super(message);
    this.name = "ErpReadToolError";
  }
}
