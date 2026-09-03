import Decimal from "decimal.js";

export type FundingCoverageStatus =
  "EXCESS_BILLING_COVERAGE" | "FULLY_COVERED" | "FUNDING_GAP";

export interface ProjectFundingCoverage {
  clientBillingCoverageHt: string | null;
  complete: boolean;
  fundingCoverageHt: string | null;
  missingOrderIds: string[];
  status: FundingCoverageStatus | null;
  supplierOrderSellHt: string | null;
}

export function calculateProjectFundingCoverage(input: {
  clientBillingCoverageComplete: boolean;
  clientBillingCoverageHt: string;
  supplierOrders: readonly {
    id: string;
    sellingHt: string | null;
    status: string;
  }[];
}): ProjectFundingCoverage {
  let supplierOrderSellHt = new Decimal(0);
  const missingOrderIds: string[] = [];

  for (const order of input.supplierOrders) {
    if (order.status === "CANCELLED") continue;
    if (order.sellingHt === null) missingOrderIds.push(order.id);
    else supplierOrderSellHt = supplierOrderSellHt.plus(order.sellingHt);
  }

  const complete =
    input.clientBillingCoverageComplete && missingOrderIds.length === 0;
  if (!complete) {
    return {
      clientBillingCoverageHt: input.clientBillingCoverageComplete
        ? input.clientBillingCoverageHt
        : null,
      complete: false,
      fundingCoverageHt: null,
      missingOrderIds,
      status: null,
      supplierOrderSellHt:
        missingOrderIds.length === 0 ? supplierOrderSellHt.toFixed(4) : null,
    };
  }

  const fundingCoverage = new Decimal(input.clientBillingCoverageHt).minus(
    supplierOrderSellHt,
  );
  return {
    clientBillingCoverageHt: new Decimal(input.clientBillingCoverageHt).toFixed(
      4,
    ),
    complete: true,
    fundingCoverageHt: fundingCoverage.toFixed(4),
    missingOrderIds,
    status: fundingCoverage.isZero()
      ? "FULLY_COVERED"
      : fundingCoverage.isPositive()
        ? "EXCESS_BILLING_COVERAGE"
        : "FUNDING_GAP",
    supplierOrderSellHt: supplierOrderSellHt.toFixed(4),
  };
}
