import { fieldErrorMap } from "@/domain/validation/issues";

const orderFormFieldNames: Record<string, string> = {
  freightMarkupOverrideRate: "freightMarkupOverridePercent",
  otherCostMarkupOverrideRate: "otherCostMarkupOverridePercent",
  productMarkupOverrideRate: "productMarkupOverridePercent",
};

export function orderFieldErrors(
  issues: readonly { message: string; path: PropertyKey[] }[],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fieldErrorMap(issues)).map(([field, message]) => [
      orderFormFieldNames[field] ?? field,
      message,
    ]),
  );
}
