import Decimal from "decimal.js";
export function freightCoverageBreakdown(
  totalHt: string,
  freightHt: string,
  allocations: readonly {
    allocatedAmount: string;
    freightCoverageHt?: string | undefined;
    otherCoverageHt?: string | undefined;
  }[],
  otherHt = "0",
) {
  const total = new Decimal(totalHt),
    freight = new Decimal(freightHt),
    other = new Decimal(otherHt);
  if (other.isNegative() || freight.plus(other).greaterThan(total))
    throw new Error("Freight and Other/services must fit within Billing HT.");
  if (freight.isNegative() || freight.greaterThan(total))
    throw new Error("Freight coverage must be between zero and document HT.");
  let allocatedFreight = new Decimal(0),
    allocatedProduct = new Decimal(0),
    allocatedOther = new Decimal(0);
  for (const allocation of allocations) {
    const amount = new Decimal(allocation.allocatedAmount),
      part = new Decimal(allocation.freightCoverageHt ?? "0"),
      otherPart = new Decimal(allocation.otherCoverageHt ?? "0");
    if (otherPart.isNegative() || part.plus(otherPart).greaterThan(amount))
      throw new Error(
        "Freight and Other/services must fit within the Order allocation.",
      );
    if (part.isNegative() || part.greaterThan(amount))
      throw new Error(
        "Order freight coverage cannot exceed its allocation HT.",
      );
    allocatedFreight = allocatedFreight.plus(part);
    allocatedOther = allocatedOther.plus(otherPart);
    allocatedProduct = allocatedProduct.plus(
      amount.minus(part).minus(otherPart),
    );
  }
  if (allocatedFreight.greaterThan(freight))
    throw new Error(
      "Order freight allocations exceed document freight coverage.",
    );
  if (allocatedOther.greaterThan(other))
    throw new Error(
      "Order Other/services allocations exceed document Other/services revenue.",
    );
  if (allocatedProduct.greaterThan(total.minus(freight).minus(other)))
    throw new Error(
      "Order non-freight allocations exceed document non-freight HT. Identify the freight portion of the allocations.",
    );
  return {
    productHt: total.minus(freight).minus(other).toFixed(4),
    allocatedFreightHt: allocatedFreight.toFixed(4),
    projectFreightHt: freight.minus(allocatedFreight).toFixed(4),
  };
}
