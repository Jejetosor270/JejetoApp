import { FinancialState } from "@/generated/prisma/client";

function stringValue(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function orderFormValues(formData: FormData) {
  return {
    buildingIds: formData
      .getAll("buildingIds")
      .filter((value): value is string => typeof value === "string"),
    category: stringValue(formData, "category"),
    description: stringValue(formData, "description"),
    financialStates: Object.values(FinancialState).map((state) => ({
      customsDuties: stringValue(formData, `${state}_customsDuties`),
      freight: stringValue(formData, `${state}_freight`),
      inputVatAmount: stringValue(formData, `${state}_inputVatAmount`),
      inputVatCountryCode: stringValue(
        formData,
        `${state}_inputVatCountryCode`,
      ),
      inputVatCustomTreatmentNote: stringValue(
        formData,
        `${state}_inputVatCustomTreatmentNote`,
      ),
      inputVatRate: stringValue(formData, `${state}_inputVatRate`),
      inputVatRecoverability: stringValue(
        formData,
        `${state}_inputVatRecoverability`,
      ),
      inputVatTaxableBase: stringValue(
        formData,
        `${state}_inputVatTaxableBase`,
      ),
      inputVatTreatment: stringValue(formData, `${state}_inputVatTreatment`),
      miscellaneous: stringValue(formData, `${state}_miscellaneous`),
      outputVatAmount: stringValue(formData, `${state}_outputVatAmount`),
      outputVatCountryCode: stringValue(
        formData,
        `${state}_outputVatCountryCode`,
      ),
      outputVatCustomTreatmentNote: stringValue(
        formData,
        `${state}_outputVatCustomTreatmentNote`,
      ),
      outputVatRate: stringValue(formData, `${state}_outputVatRate`),
      outputVatTaxableBase: stringValue(
        formData,
        `${state}_outputVatTaxableBase`,
      ),
      outputVatTreatment: stringValue(formData, `${state}_outputVatTreatment`),
      purchaseFxRate: stringValue(formData, `${state}_purchaseFxRate`),
      sellingFxRate: stringValue(formData, `${state}_sellingFxRate`),
      state,
      supplierDiscount: stringValue(formData, `${state}_supplierDiscount`),
      supplierPurchase: stringValue(formData, `${state}_supplierPurchase`),
    })),
    freightResaleAmount: stringValue(formData, "freightResaleAmount"),
    freightTreatment: stringValue(formData, "freightTreatment"),
    notes: stringValue(formData, "notes"),
    orderCurrencyCode: stringValue(formData, "orderCurrencyCode"),
    orderNumber: stringValue(formData, "orderNumber"),
    packageName: stringValue(formData, "packageName"),
    pricingMode: stringValue(formData, "pricingMode"),
    pricingSourceState: stringValue(formData, "pricingSourceState"),
    projectId: stringValue(formData, "projectId"),
    sellingPriceAmount: stringValue(formData, "sellingPriceAmount"),
    sellingCurrencyCode: stringValue(formData, "sellingCurrencyCode"),
    status: stringValue(formData, "status"),
    supplierId: stringValue(formData, "supplierId"),
    supplierOrderConfirmationReference: stringValue(
      formData,
      "supplierOrderConfirmationReference",
    ),
    supplierQuoteReference: stringValue(formData, "supplierQuoteReference"),
    targetMarginRate: stringValue(formData, "targetMarginPercent"),
  };
}
