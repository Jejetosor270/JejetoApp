import type { OrderPricingMethod } from "@/domain/finance/order-pricing";

export interface OrderDraft {
  carrierCode?: string;
  carrierOtherName?: string;
  trackingReference?: string;
  budgetPurchaseAmountHt?: string;
  actualDeliveryDate: string;
  buildingIds: string[];
  category: string;
  customsDuties: string;
  description: string;
  expectedDeliveryDate: string;
  expectedReadyDate: string;
  freight: string;
  freightAllowanceMode: "AUTO" | "MANUAL";
  freightAllowanceOverrideAmount: string;
  freightMarkupOverridePercent: string;
  freightResaleAmount: string;
  freightTreatment: string;
  inputVatAmount: string;
  inputVatCountryCode: string;
  inputVatCustomTreatmentNote: string;
  inputVatRate: string;
  inputVatRecoverablePercent: string;
  inputVatTaxableBase: string;
  /** Editor-only: saved/employee-entered bases must not be silently replaced. */
  inputVatBaseIsManual?: boolean;
  inputVatTreatment: string;
  leadTimeWeeks: string;
  miscellaneous: string;
  notes: string;
  orderCurrencyCode: string;
  orderDate: string;
  invoiceDate: string;
  orderNumber: string;
  otherCostMarkupOverridePercent: string;
  outputVatBaseMode: "AUTO" | "MANUAL";
  outputVatCountryCode: string;
  outputVatCustomTreatmentNote: string;
  outputVatRate: string;
  outputVatTaxableBaseOverride: string;
  outputVatTreatment: string;
  packageName: string;
  pricingMode: OrderPricingMethod;
  productMarkupOverridePercent: string;
  projectId: string;
  purchaseCost: string;
  purchaseFxRate: string;
  quoteDate: string;
  sellingCurrencyCode: string;
  sellingFxRate: string;
  sellingPriceAmount: string;
  status: string;
  supplierId: string;
  supplierOrderConfirmationReference: string;
  supplierQuoteReference: string;
}

export function updateOrderDraftField<K extends keyof OrderDraft>(
  draft: OrderDraft,
  field: K,
  value: OrderDraft[K],
): OrderDraft {
  if (field === "inputVatTaxableBase")
    return { ...draft, [field]: value, inputVatBaseIsManual: true };
  if (field === "inputVatBaseIsManual" && value === false)
    return {
      ...draft,
      inputVatBaseIsManual: false,
      inputVatTaxableBase: draft.purchaseCost,
    };
  if (
    field === "purchaseCost" &&
    !draft.inputVatBaseIsManual &&
    typeof value === "string"
  )
    return { ...draft, purchaseCost: value, inputVatTaxableBase: value };
  return { ...draft, [field]: value };
}
