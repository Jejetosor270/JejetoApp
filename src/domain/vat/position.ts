import Decimal from "decimal.js";

export type ProjectVatPositionStatus = "CREDIT" | "NEUTRAL" | "PAYABLE";

export interface ProjectVatPosition {
  complete: boolean;
  deductibleInputVat: string | null;
  netVat: string | null;
  outputVat: string | null;
  positionAmount: string | null;
  status: ProjectVatPositionStatus | null;
}

export function calculateProjectVatPosition(input: {
  deductibleInputVat: string | null;
  outputVat: string | null;
}): ProjectVatPosition {
  if (input.outputVat === null || input.deductibleInputVat === null) {
    return {
      complete: false,
      deductibleInputVat: input.deductibleInputVat,
      netVat: null,
      outputVat: input.outputVat,
      positionAmount: null,
      status: null,
    };
  }
  const netVat = new Decimal(input.outputVat).minus(input.deductibleInputVat);
  const status = netVat.isZero()
    ? "NEUTRAL"
    : netVat.isPositive()
      ? "PAYABLE"
      : "CREDIT";
  return {
    complete: true,
    deductibleInputVat: new Decimal(input.deductibleInputVat).toFixed(4),
    netVat: netVat.toFixed(4),
    outputVat: new Decimal(input.outputVat).toFixed(4),
    positionAmount: netVat.abs().toFixed(4),
    status,
  };
}
