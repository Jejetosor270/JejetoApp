import { z } from "zod";

function blankToNull(value: unknown): unknown {
  return value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
    ? null
    : value;
}

export function requiredUuid(message: string) {
  return z.preprocess(
    (value) => (blankToNull(value) === null ? "" : value),
    z.uuid(message),
  );
}

export function optionalUuid(message: string) {
  return z.preprocess(blankToNull, z.union([z.uuid(message), z.null()]));
}
