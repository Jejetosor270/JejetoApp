import "server-only";

import Decimal from "decimal.js";

import {
  FinancialState,
  FreightTreatment,
  PricingMode,
  Prisma,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  VatDirection,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import {
  amountIncludingVat,
  crossCurrencyFinancialMetrics,
  economicLandedCost,
  landedCost,
  reportingAmount,
  sellingPriceFromTargetMargin,
  totalSellingRevenue,
  vatAmount as calculateVatAmount,
} from "@/domain/finance/calculations";
import type {
  CreateOrderInput,
  FinancialStateInput,
  UpdateOrderInput,
} from "@/domain/procurement/validation";
import { getDatabase } from "@/lib/db";

import { ProcurementNotFoundError, ProcurementRelationError } from "./errors";

const orderInclude = {
  buildings: {
    include: {
      building: { select: { id: true, name: true, shortCode: true } },
    },
  },
  financials: { include: { costLines: true, vatEntries: true } },
  project: { select: { id: true, name: true, reportingCurrencyCode: true } },
  supplier: {
    select: { defaultCurrencyCode: true, displayName: true, id: true },
  },
} satisfies Prisma.ProcurementOrderInclude;

type OrderRecord = Prisma.ProcurementOrderGetPayload<{
  include: typeof orderInclude;
}>;
type FinancialRecord = OrderRecord["financials"][number];

export interface VatSummary {
  amount: string;
  amountIsManual: boolean;
  countryCode: string | null;
  customTreatmentNote: string | null;
  rate: string | null;
  recoverability: VatRecoverability | null;
  reportingAmount: string | null;
  taxableBase: string;
  treatment: VatTreatment;
  totalIncludingVat: string;
}

export interface FinancialStateSummary {
  conversionComplete: boolean;
  customsDuties: string | null;
  economicLandedCost: string | null;
  freight: string | null;
  grossMarginRate: string | null;
  grossProfit: string | null;
  inputVat: VatSummary | null;
  landedCost: string | null;
  markupRate: string | null;
  missingFx: string[];
  miscellaneous: string | null;
  outputVat: VatSummary | null;
  purchaseFxRate: string | null;
  reportingEconomicLandedCost: string | null;
  reportingLandedCost: string | null;
  reportingSellingRevenue: string | null;
  sellingFxRate: string | null;
  state: FinancialState;
  supplierDiscount: string | null;
  supplierPurchase: string | null;
}

export interface OrderSummary {
  buildingIds: string[];
  buildings: string[];
  category: string | null;
  description: string | null;
  financialStates: FinancialStateSummary[];
  freightResaleAmount: string | null;
  freightTreatment: FreightTreatment;
  id: string;
  notes: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: PricingMode;
  pricingSourceState: FinancialState;
  project: { id: string; name: string; reportingCurrencyCode: string };
  sellingCurrencyCode: string;
  status: ProcurementOrderStatus;
  supplier: { defaultCurrencyCode: string; displayName: string; id: string };
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
  targetMarginRate: string | null;
  totalSellingRevenue: string | null;
  updatedAt: string;
}

export interface ProjectProcurementSummary {
  convertedOrderCount: number;
  incompleteOrderCount: number;
  totalCommittedEconomicCost: string;
  totalCommittedGrossProfit: string;
  totalCommittedSellingRevenue: string;
}

export function projectProcurementSummary(
  orders: OrderSummary[],
): ProjectProcurementSummary {
  let convertedOrderCount = 0;
  let incompleteOrderCount = 0;
  let totalCost = new Decimal(0);
  let totalRevenue = new Decimal(0);
  for (const order of orders) {
    const committed = order.financialStates.find(
      (state) => state.state === FinancialState.COMMITTED,
    );
    if (
      !committed?.conversionComplete ||
      committed.reportingEconomicLandedCost === null ||
      committed.reportingSellingRevenue === null
    ) {
      incompleteOrderCount += 1;
      continue;
    }
    convertedOrderCount += 1;
    totalCost = totalCost.plus(committed.reportingEconomicLandedCost);
    totalRevenue = totalRevenue.plus(committed.reportingSellingRevenue);
  }
  return {
    convertedOrderCount,
    incompleteOrderCount,
    totalCommittedEconomicCost: totalCost.toString(),
    totalCommittedGrossProfit: totalRevenue.minus(totalCost).toString(),
    totalCommittedSellingRevenue: totalRevenue.toString(),
  };
}

function amountFor(
  financial: FinancialRecord | undefined,
  category: ProcurementCostCategory,
  source: "originalAmount" | "reportingAmount" = "originalAmount",
): string | null {
  const line = financial?.costLines.find((item) => item.category === category);
  if (!line) return null;
  if (source === "originalAmount") return line.originalAmount.toString();
  return (
    reportingAmount({
      fxRateToReporting: line.fxRateToReporting?.toString(),
      originalAmount: line.originalAmount.toString(),
      originalCurrencyCode: line.originalCurrencyCode,
      reportingCurrencyCode: line.reportingCurrencyCode,
    })?.toString() ?? null
  );
}

function landedForFinancial(
  financial: FinancialRecord | undefined,
  source: "originalAmount" | "reportingAmount" = "originalAmount",
): Decimal | null {
  if (!financial || financial.costLines.length === 0) return null;
  if (
    source === "reportingAmount" &&
    financial.costLines.some(
      (line) =>
        reportingAmount({
          fxRateToReporting: line.fxRateToReporting?.toString(),
          originalAmount: line.originalAmount.toString(),
          originalCurrencyCode: line.originalCurrencyCode,
          reportingCurrencyCode: line.reportingCurrencyCode,
        }) === null,
    )
  ) {
    return null;
  }
  return landedCost({
    customsDuties:
      amountFor(financial, ProcurementCostCategory.CUSTOMS_DUTIES, source) ??
      "0",
    freight:
      amountFor(financial, ProcurementCostCategory.FREIGHT, source) ?? "0",
    miscellaneous:
      amountFor(financial, ProcurementCostCategory.MISCELLANEOUS, source) ??
      "0",
    supplierDiscount:
      amountFor(financial, ProcurementCostCategory.SUPPLIER_DISCOUNT, source) ??
      "0",
    supplierPurchase:
      amountFor(financial, ProcurementCostCategory.SUPPLIER_PURCHASE, source) ??
      "0",
  });
}

function vatFor(
  financial: FinancialRecord | undefined,
  direction: VatDirection,
): FinancialRecord["vatEntries"][number] | undefined {
  return financial?.vatEntries.find((entry) => entry.direction === direction);
}

function vatSummary(
  entry: FinancialRecord["vatEntries"][number] | undefined,
): VatSummary | null {
  if (!entry) return null;
  return {
    amount: entry.vatAmount.toString(),
    amountIsManual: entry.isAmountOverride,
    countryCode: entry.countryCode,
    customTreatmentNote: entry.customTreatmentNote,
    rate: entry.vatRate?.toString() ?? null,
    recoverability: entry.recoverability,
    reportingAmount: vatReportingAmount(entry)?.toString() ?? null,
    taxableBase: entry.taxableBaseAmount.toString(),
    treatment: entry.treatment,
    totalIncludingVat: amountIncludingVat(
      entry.taxableBaseAmount.toString(),
      entry.vatAmount.toString(),
    ).toString(),
  };
}

function vatReportingAmount(
  entry: FinancialRecord["vatEntries"][number],
): Decimal | null {
  return reportingAmount({
    fxRateToReporting: entry.fxRateToReporting?.toString(),
    originalAmount: entry.vatAmount.toString(),
    originalCurrencyCode: entry.originalCurrencyCode,
    reportingCurrencyCode: entry.reportingCurrencyCode,
  });
}

function nonRecoverableInputVat(
  financial: FinancialRecord | undefined,
  source: "vatAmount" | "reportingVatAmount",
): Decimal {
  const entry = vatFor(financial, VatDirection.INPUT);
  if (!entry || entry.recoverability !== VatRecoverability.NON_RECOVERABLE) {
    return new Decimal(0);
  }
  if (source === "vatAmount") return new Decimal(entry.vatAmount.toString());
  return vatReportingAmount(entry) ?? new Decimal(0);
}

function reportingEconomicCost(
  financial: FinancialRecord | undefined,
): Decimal | null {
  const reportingLanded = landedForFinancial(financial, "reportingAmount");
  if (!reportingLanded) return null;
  const inputVat = vatFor(financial, VatDirection.INPUT);
  if (
    inputVat?.recoverability === VatRecoverability.NON_RECOVERABLE &&
    vatReportingAmount(inputVat) === null
  ) {
    return null;
  }
  return economicLandedCost(
    reportingLanded,
    nonRecoverableInputVat(financial, "reportingVatAmount"),
  );
}

function effectiveFxRate(
  originalCurrencyCode: string,
  reportingCurrencyCode: string,
  storedRate: Decimal | null | undefined,
): Decimal | null {
  if (originalCurrencyCode === reportingCurrencyCode) return new Decimal(1);
  return storedRate ? new Decimal(storedRate.toString()) : null;
}

function targetPackagePrice(order: OrderRecord): Decimal | null {
  const source = order.financials.find(
    (financial) => financial.state === order.pricingSourceState,
  );
  const economicCost = reportingEconomicCost(source);
  const sellingFx = effectiveFxRate(
    order.sellingCurrencyCode,
    order.project.reportingCurrencyCode,
    source?.sellingFxRateToReporting,
  );
  if (!economicCost || !sellingFx || !order.targetMarginRate) return null;
  const requiredReportingRevenue = sellingPriceFromTargetMargin(
    economicCost,
    order.targetMarginRate.toString(),
  );
  const requiredOriginalRevenue = requiredReportingRevenue.dividedBy(sellingFx);
  const freightResale =
    order.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
      ? new Decimal(order.freightResaleAmount?.toString() ?? 0)
      : new Decimal(0);
  const packagePrice = requiredOriginalRevenue.minus(freightResale);
  return packagePrice.isNegative() ? null : packagePrice;
}

function commercialValues(order: OrderRecord): {
  packagePrice: Decimal | null;
  totalRevenue: Decimal | null;
} {
  const packagePrice =
    order.pricingMode === PricingMode.SELLING_PRICE
      ? order.sellingPriceAmount
        ? new Decimal(order.sellingPriceAmount.toString())
        : null
      : targetPackagePrice(order);
  return {
    packagePrice,
    totalRevenue: packagePrice
      ? totalSellingRevenue(
          packagePrice,
          order.freightTreatment,
          order.freightResaleAmount?.toString() ?? "0",
        )
      : null,
  };
}

export function summarizeOrder(order: OrderRecord): OrderSummary {
  const commercial = commercialValues(order);
  const states = Object.values(FinancialState).map((state) => {
    const financial = order.financials.find((item) => item.state === state);
    const landed = landedForFinancial(financial);
    const reportingLanded = landedForFinancial(financial, "reportingAmount");
    const economic = landed
      ? economicLandedCost(
          landed,
          nonRecoverableInputVat(financial, "vatAmount"),
        )
      : null;
    const reportingEconomic = reportingEconomicCost(financial);
    const sellingFx = effectiveFxRate(
      order.sellingCurrencyCode,
      order.project.reportingCurrencyCode,
      financial?.sellingFxRateToReporting,
    );
    const reportingRevenue =
      commercial.totalRevenue && sellingFx
        ? commercial.totalRevenue.times(sellingFx)
        : null;
    const metrics =
      economic !== null && commercial.totalRevenue !== null
        ? crossCurrencyFinancialMetrics({
            economicLandedCost: economic,
            purchaseCurrencyCode: order.orderCurrencyCode,
            purchaseFxRateToReporting:
              financial?.costLines[0]?.fxRateToReporting?.toString(),
            reportingCurrencyCode: order.project.reportingCurrencyCode,
            sellingCurrencyCode: order.sellingCurrencyCode,
            sellingFxRateToReporting:
              financial?.sellingFxRateToReporting?.toString(),
            sellingRevenue: commercial.totalRevenue,
          })
        : null;
    const missingFx: string[] = [];
    if (landed && reportingLanded === null) missingFx.push("purchase FX");
    if (commercial.totalRevenue && sellingFx === null)
      missingFx.push("selling FX");
    const inputVat = vatFor(financial, VatDirection.INPUT);
    if (inputVat && vatReportingAmount(inputVat) === null) {
      missingFx.push("input VAT FX");
    }
    const outputVat = vatFor(financial, VatDirection.OUTPUT);
    if (outputVat && vatReportingAmount(outputVat) === null) {
      missingFx.push("output VAT FX");
    }
    return {
      conversionComplete: missingFx.length === 0,
      customsDuties: amountFor(
        financial,
        ProcurementCostCategory.CUSTOMS_DUTIES,
      ),
      economicLandedCost: economic?.toString() ?? null,
      freight: amountFor(financial, ProcurementCostCategory.FREIGHT),
      grossMarginRate: metrics?.grossMarginRate?.toString() ?? null,
      grossProfit: metrics?.grossProfit.toString() ?? null,
      inputVat: vatSummary(inputVat),
      landedCost: landed?.toString() ?? null,
      markupRate: metrics?.markupRate?.toString() ?? null,
      missingFx,
      miscellaneous: amountFor(
        financial,
        ProcurementCostCategory.MISCELLANEOUS,
      ),
      outputVat: vatSummary(outputVat),
      purchaseFxRate:
        financial?.costLines[0]?.fxRateToReporting?.toString() ?? null,
      reportingEconomicLandedCost: reportingEconomic?.toString() ?? null,
      reportingLandedCost: reportingLanded?.toString() ?? null,
      reportingSellingRevenue: reportingRevenue?.toString() ?? null,
      sellingFxRate: financial?.sellingFxRateToReporting?.toString() ?? null,
      state,
      supplierDiscount: amountFor(
        financial,
        ProcurementCostCategory.SUPPLIER_DISCOUNT,
      ),
      supplierPurchase: amountFor(
        financial,
        ProcurementCostCategory.SUPPLIER_PURCHASE,
      ),
    };
  });

  return {
    buildingIds: order.buildings.map(({ buildingId }) => buildingId),
    buildings: order.buildings.map(
      ({ building }) => building.shortCode || building.name,
    ),
    category: order.category,
    description: order.description,
    financialStates: states,
    freightResaleAmount: order.freightResaleAmount?.toString() ?? null,
    freightTreatment: order.freightTreatment,
    id: order.id,
    notes: order.notes,
    orderCurrencyCode: order.orderCurrencyCode,
    orderNumber: order.orderNumber,
    packageName: order.packageName,
    packageSellingPrice: commercial.packagePrice?.toString() ?? null,
    pricingMode: order.pricingMode,
    pricingSourceState: order.pricingSourceState,
    project: order.project,
    sellingCurrencyCode: order.sellingCurrencyCode,
    status: order.status,
    supplier: order.supplier,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference,
    supplierQuoteReference: order.supplierQuoteReference,
    targetMarginRate: order.targetMarginRate?.toString() ?? null,
    totalSellingRevenue: commercial.totalRevenue?.toString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
  };
}

function stateHasValues(state: FinancialStateInput): boolean {
  return Boolean(
    state.supplierPurchase ||
    state.supplierDiscount ||
    state.freight ||
    state.customsDuties ||
    state.miscellaneous ||
    state.inputVatTreatment ||
    state.outputVatTreatment,
  );
}

function convertedValue(
  amount: string,
  originalCurrencyCode: string,
  reportingCurrencyCode: string,
  fxRate: string | undefined,
): string | null {
  return (
    reportingAmount({
      fxRateToReporting: fxRate,
      originalAmount: amount,
      originalCurrencyCode,
      reportingCurrencyCode,
    })?.toFixed(4) ?? null
  );
}

function costLines(
  state: FinancialStateInput,
  originalCurrencyCode: string,
  reportingCurrencyCode: string,
  actorId: string,
) {
  const values = [
    [ProcurementCostCategory.SUPPLIER_PURCHASE, state.supplierPurchase],
    [ProcurementCostCategory.SUPPLIER_DISCOUNT, state.supplierDiscount],
    [ProcurementCostCategory.FREIGHT, state.freight],
    [ProcurementCostCategory.CUSTOMS_DUTIES, state.customsDuties],
    [ProcurementCostCategory.MISCELLANEOUS, state.miscellaneous],
  ] as const;
  const fxRateToReporting =
    originalCurrencyCode === reportingCurrencyCode
      ? null
      : (state.purchaseFxRate ?? null);
  return values.flatMap(([category, amount]) =>
    amount
      ? [
          {
            category,
            createdById: actorId,
            fxRateToReporting,
            originalAmount: amount,
            originalCurrencyCode,
            reportingAmount: convertedValue(
              amount,
              originalCurrencyCode,
              reportingCurrencyCode,
              state.purchaseFxRate,
            ),
            reportingCurrencyCode,
            updatedById: actorId,
          },
        ]
      : [],
  );
}

function stateVatAmount(
  taxableBase: string,
  rate: string | undefined,
  manualAmount: string | undefined,
): string {
  if (manualAmount) return manualAmount;
  return calculateVatAmount(taxableBase, rate ?? "0").toFixed(4);
}

function vatEntries(
  state: FinancialStateInput,
  purchaseCurrencyCode: string,
  sellingCurrencyCode: string,
  reportingCurrencyCode: string,
  actorId: string,
) {
  const definitions = [
    {
      amount: state.inputVatAmount,
      countryCode: state.inputVatCountryCode,
      customTreatmentNote: state.inputVatCustomTreatmentNote,
      direction: VatDirection.INPUT,
      fxRate: state.purchaseFxRate,
      originalCurrencyCode: purchaseCurrencyCode,
      rate: state.inputVatRate,
      recoverability: state.inputVatRecoverability ?? null,
      taxableBase: state.inputVatTaxableBase,
      treatment: state.inputVatTreatment,
    },
    {
      amount: state.outputVatAmount,
      countryCode: state.outputVatCountryCode,
      customTreatmentNote: state.outputVatCustomTreatmentNote,
      direction: VatDirection.OUTPUT,
      fxRate: state.sellingFxRate,
      originalCurrencyCode: sellingCurrencyCode,
      rate: state.outputVatRate,
      recoverability: null,
      taxableBase: state.outputVatTaxableBase,
      treatment: state.outputVatTreatment,
    },
  ] as const;
  return definitions.flatMap((entry) => {
    if (!entry.treatment || !entry.taxableBase) return [];
    const amount = stateVatAmount(entry.taxableBase, entry.rate, entry.amount);
    const fxRateToReporting =
      entry.originalCurrencyCode === reportingCurrencyCode
        ? null
        : (entry.fxRate ?? null);
    return [
      {
        countryCode: entry.countryCode ?? null,
        createdById: actorId,
        customTreatmentNote: entry.customTreatmentNote ?? null,
        direction: entry.direction,
        fxRateToReporting,
        isAmountOverride: Boolean(entry.amount),
        originalCurrencyCode: entry.originalCurrencyCode,
        recoverability: entry.recoverability,
        reportingCurrencyCode,
        reportingTaxableBase: convertedValue(
          entry.taxableBase,
          entry.originalCurrencyCode,
          reportingCurrencyCode,
          entry.fxRate,
        ),
        reportingVatAmount: convertedValue(
          amount,
          entry.originalCurrencyCode,
          reportingCurrencyCode,
          entry.fxRate,
        ),
        taxableBaseAmount: entry.taxableBase,
        treatment: entry.treatment,
        updatedById: actorId,
        vatAmount: amount,
        vatRate: entry.rate ?? null,
      },
    ];
  });
}

function inputEconomicCost(
  state: FinancialStateInput,
  purchaseCurrencyCode: string,
  reportingCurrencyCode: string,
): Decimal | null {
  if (!stateHasValues(state)) return null;
  const originalLanded = landedCost({
    customsDuties: state.customsDuties ?? "0",
    freight: state.freight ?? "0",
    miscellaneous: state.miscellaneous ?? "0",
    supplierDiscount: state.supplierDiscount ?? "0",
    supplierPurchase: state.supplierPurchase ?? "0",
  });
  const reportingLanded = reportingAmount({
    fxRateToReporting: state.purchaseFxRate,
    originalAmount: originalLanded,
    originalCurrencyCode: purchaseCurrencyCode,
    reportingCurrencyCode,
  });
  if (!reportingLanded) return null;
  if (
    state.inputVatTreatment &&
    state.inputVatRecoverability === VatRecoverability.NON_RECOVERABLE &&
    state.inputVatTaxableBase
  ) {
    const originalVat = stateVatAmount(
      state.inputVatTaxableBase,
      state.inputVatRate,
      state.inputVatAmount,
    );
    const reportingVat = reportingAmount({
      fxRateToReporting: state.purchaseFxRate,
      originalAmount: originalVat,
      originalCurrencyCode: purchaseCurrencyCode,
      reportingCurrencyCode,
    });
    if (!reportingVat) return null;
    return economicLandedCost(reportingLanded, reportingVat);
  }
  return reportingLanded;
}

async function assertRelations(input: CreateOrderInput): Promise<string> {
  const database = getDatabase();
  const [project, supplier, purchaseCurrency, sellingCurrency, buildings] =
    await Promise.all([
      database.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, reportingCurrencyCode: true },
      }),
      database.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true },
      }),
      database.currency.findFirst({
        where: { code: input.orderCurrencyCode, isActive: true },
        select: { code: true },
      }),
      database.currency.findFirst({
        where: { code: input.sellingCurrencyCode, isActive: true },
        select: { code: true },
      }),
      input.buildingIds.length
        ? database.building.findMany({
            where: {
              id: { in: input.buildingIds },
              projectId: input.projectId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
  if (!project) throw new ProcurementRelationError("Choose a valid project.");
  if (!supplier) throw new ProcurementRelationError("Choose a valid supplier.");
  if (!purchaseCurrency || !sellingCurrency) {
    throw new ProcurementRelationError(
      "Choose active purchase and selling currencies.",
    );
  }
  if (buildings.length !== input.buildingIds.length) {
    throw new ProcurementRelationError(
      "Every selected building must belong to the chosen project.",
    );
  }
  if (input.pricingMode === PricingMode.TARGET_MARGIN) {
    const source = input.financialStates.find(
      (state) => state.state === input.pricingSourceState,
    );
    const sourceCost = source
      ? inputEconomicCost(
          source,
          input.orderCurrencyCode,
          project.reportingCurrencyCode,
        )
      : null;
    if (!sourceCost || !input.targetMarginRate) {
      throw new ProcurementRelationError(
        "Target-margin pricing requires converted costs in the selected pricing state.",
      );
    }
    const sellingFx = effectiveFxRate(
      input.sellingCurrencyCode,
      project.reportingCurrencyCode,
      source?.sellingFxRate ? new Decimal(source.sellingFxRate) : null,
    );
    if (!sellingFx) {
      throw new ProcurementRelationError(
        "Target-margin pricing requires selling FX in the selected pricing state.",
      );
    }
    const requiredRevenue = sellingPriceFromTargetMargin(
      sourceCost,
      input.targetMarginRate,
    ).dividedBy(sellingFx);
    const freightResale =
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? new Decimal(input.freightResaleAmount ?? 0)
        : new Decimal(0);
    if (requiredRevenue.minus(freightResale).isNegative()) {
      throw new ProcurementRelationError(
        "Freight resale cannot exceed the selling revenue required by the target margin.",
      );
    }
  }
  return project.reportingCurrencyCode;
}

function orderData(input: CreateOrderInput) {
  return {
    category: input.category ?? null,
    description: input.description ?? null,
    freightResaleAmount:
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? (input.freightResaleAmount ?? null)
        : null,
    freightTreatment: input.freightTreatment,
    notes: input.notes ?? null,
    orderCurrencyCode: input.orderCurrencyCode,
    orderNumber: input.orderNumber,
    packageName: input.packageName,
    pricingMode: input.pricingMode,
    pricingSourceState: input.pricingSourceState,
    projectId: input.projectId,
    sellingCurrencyCode: input.sellingCurrencyCode,
    sellingPriceAmount:
      input.pricingMode === PricingMode.SELLING_PRICE
        ? (input.sellingPriceAmount ?? null)
        : null,
    status: input.status,
    supplierId: input.supplierId,
    supplierOrderConfirmationReference:
      input.supplierOrderConfirmationReference ?? null,
    supplierQuoteReference: input.supplierQuoteReference ?? null,
    targetMarginRate:
      input.pricingMode === PricingMode.TARGET_MARGIN
        ? (input.targetMarginRate ?? null)
        : null,
  };
}

export async function listOrderOptions() {
  const database = getDatabase();
  const [projects, suppliers, currencies] = await Promise.all([
    database.project.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        buildings: {
          orderBy: { name: "asc" },
          select: { id: true, isActive: true, name: true, shortCode: true },
        },
        client: { select: { defaultCurrencyCode: true } },
        id: true,
        name: true,
        reportingCurrencyCode: true,
      },
    }),
    database.supplier.findMany({
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: { defaultCurrencyCode: true, displayName: true, id: true },
    }),
    database.currency.findMany({
      orderBy: { code: "asc" },
      where: { isActive: true },
      select: { code: true, name: true },
    }),
  ]);
  return {
    currencies,
    financialStates: Object.values(FinancialState),
    freightTreatments: Object.values(FreightTreatment),
    pricingModes: Object.values(PricingMode),
    projects,
    statuses: Object.values(ProcurementOrderStatus),
    suppliers,
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}

export async function listOrders(filters: {
  projectId?: string | undefined;
  query: string;
  status?: ProcurementOrderStatus | undefined;
  supplierId?: string | undefined;
}): Promise<OrderSummary[]> {
  const query = filters.query.trim();
  const orders = await getDatabase().procurementOrder.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(query
        ? {
            OR: [
              { orderNumber: { contains: query, mode: "insensitive" } },
              { packageName: { contains: query, mode: "insensitive" } },
              {
                supplierQuoteReference: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              { project: { name: { contains: query, mode: "insensitive" } } },
              {
                supplier: {
                  displayName: { contains: query, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },
    include: orderInclude,
    orderBy: { updatedAt: "desc" },
  });
  return orders.map(summarizeOrder);
}

export async function getOrder(orderId: string): Promise<OrderSummary | null> {
  const order = await getDatabase().procurementOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return order ? summarizeOrder(order) : null;
}

export async function listProjectOrders(
  projectId: string,
): Promise<OrderSummary[]> {
  return listOrders({ projectId, query: "" });
}

async function replaceFinancialStates(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  input: CreateOrderInput,
  reportingCurrencyCode: string,
): Promise<void> {
  for (const state of input.financialStates) {
    const existing = await transaction.procurementOrderFinancials.findUnique({
      where: { orderId_state: { orderId, state: state.state } },
      select: { id: true },
    });
    if (!existing && !stateHasValues(state)) continue;
    const sellingFxRateToReporting =
      input.sellingCurrencyCode === reportingCurrencyCode
        ? null
        : (state.sellingFxRate ?? null);
    const financial = await transaction.procurementOrderFinancials.upsert({
      where: { orderId_state: { orderId, state: state.state } },
      create: {
        createdById: actorId,
        orderId,
        sellingFxRateToReporting,
        state: state.state,
        updatedById: actorId,
      },
      update: { sellingFxRateToReporting, updatedById: actorId },
      select: { id: true },
    });
    await Promise.all([
      transaction.procurementOrderCostLine.deleteMany({
        where: { financialsId: financial.id },
      }),
      transaction.procurementOrderVatEntry.deleteMany({
        where: { financialsId: financial.id },
      }),
    ]);
    const lines = costLines(
      state,
      input.orderCurrencyCode,
      reportingCurrencyCode,
      actorId,
    );
    const entries = vatEntries(
      state,
      input.orderCurrencyCode,
      input.sellingCurrencyCode,
      reportingCurrencyCode,
      actorId,
    );
    await Promise.all([
      lines.length
        ? transaction.procurementOrderCostLine.createMany({
            data: lines.map((line) => ({
              ...line,
              financialsId: financial.id,
            })),
          })
        : Promise.resolve(),
      entries.length
        ? transaction.procurementOrderVatEntry.createMany({
            data: entries.map((entry) => ({
              ...entry,
              financialsId: financial.id,
            })),
          })
        : Promise.resolve(),
    ]);
  }
}

export async function createOrder(
  actorId: string,
  input: CreateOrderInput,
): Promise<string> {
  const reportingCurrencyCode = await assertRelations(input);
  return getDatabase().$transaction(async (transaction) => {
    const order = await transaction.procurementOrder.create({
      data: {
        ...orderData(input),
        buildings: {
          create: input.buildingIds.map((buildingId) => ({
            buildingId,
            createdById: actorId,
          })),
        },
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    await replaceFinancialStates(
      transaction,
      order.id,
      actorId,
      input,
      reportingCurrencyCode,
    );
    return order.id;
  });
}

export async function updateOrder(
  actorId: string,
  input: UpdateOrderInput,
): Promise<void> {
  const reportingCurrencyCode = await assertRelations(input);
  const { id, ...fields } = input;
  try {
    await getDatabase().$transaction(async (transaction) => {
      await transaction.procurementOrder.update({
        where: { id },
        data: { ...orderData(fields), updatedById: actorId },
      });
      await transaction.procurementOrderBuilding.deleteMany({
        where: { orderId: id },
      });
      if (input.buildingIds.length) {
        await transaction.procurementOrderBuilding.createMany({
          data: input.buildingIds.map((buildingId) => ({
            buildingId,
            createdById: actorId,
            orderId: id,
          })),
        });
      }
      await replaceFinancialStates(
        transaction,
        id,
        actorId,
        fields,
        reportingCurrencyCode,
      );
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new ProcurementNotFoundError();
    }
    throw error;
  }
}
