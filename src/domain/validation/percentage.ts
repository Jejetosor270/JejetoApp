import Decimal from "decimal.js";
import { z } from "zod";

import { normalizeDecimalInput } from "@/domain/validation/numeric";

const humanPercentagePattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function normalizePercentageText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withoutSuffix = trimmed.endsWith("%")
    ? trimmed.slice(0, -1).trim()
    : trimmed;
  const normalized = normalizeDecimalInput(withoutSuffix, {
    allowNegative: true,
    maximumDecimalPlaces: 10,
  });
  return normalized === null ? withoutSuffix : normalized;
}

export function optionalPercentageFraction({
  label = "Percentage",
  maximumPercent,
}: {
  label?: string | undefined;
  maximumPercent?: string | undefined;
} = {}) {
  const rangeMessage = maximumPercent
    ? `${label} must be between 0 and ${maximumPercent}.`
    : `${label} must be zero or greater.`;

  return z.preprocess(
    normalizePercentageText,
    z
      .string()
      .regex(
        humanPercentagePattern,
        `${label} must be a valid percentage, for example 15 or 15.5.`,
      )
      .refine(
        (value) =>
          !humanPercentagePattern.test(value) ||
          maximumPercent === undefined ||
          new Decimal(value).lessThanOrEqualTo(maximumPercent),
        rangeMessage,
      )
      .transform((value) =>
        new Decimal(value)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
          .dividedBy(100)
          .toFixed(6),
      )
      .optional(),
  );
}

export function humanPercentageToFraction(
  value: string,
  options?: Parameters<typeof optionalPercentageFraction>[0],
): string | null {
  const parsed = optionalPercentageFraction(options).safeParse(value);
  return parsed.success ? (parsed.data ?? null) : null;
}
