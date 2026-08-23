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
    customsDuties: stringValue(formData, "customsDuties"),
    description: stringValue(formData, "description"),
    freight: stringValue(formData, "freight"),
    freightResaleAmount: stringValue(formData, "freightResaleAmount"),
    freightTreatment: stringValue(formData, "freightTreatment"),
    inputVatAmount: stringValue(formData, "inputVatAmount"),
    inputVatCountryCode: stringValue(formData, "inputVatCountryCode"),
    inputVatCustomTreatmentNote: stringValue(
      formData,
      "inputVatCustomTreatmentNote",
    ),
    inputVatRate: stringValue(formData, "inputVatRate"),
    inputVatRecoverability: stringValue(formData, "inputVatRecoverability"),
    inputVatTaxableBase: stringValue(formData, "inputVatTaxableBase"),
    inputVatTreatment: stringValue(formData, "inputVatTreatment"),
    miscellaneous: stringValue(formData, "miscellaneous"),
    notes: stringValue(formData, "notes"),
    orderCurrencyCode: stringValue(formData, "orderCurrencyCode"),
    orderNumber: stringValue(formData, "orderNumber"),
    outputVatAmount: stringValue(formData, "outputVatAmount"),
    outputVatCountryCode: stringValue(formData, "outputVatCountryCode"),
    outputVatCustomTreatmentNote: stringValue(
      formData,
      "outputVatCustomTreatmentNote",
    ),
    outputVatRate: stringValue(formData, "outputVatRate"),
    outputVatTaxableBase: stringValue(formData, "outputVatTaxableBase"),
    outputVatTreatment: stringValue(formData, "outputVatTreatment"),
    packageName: stringValue(formData, "packageName"),
    pricingMode: stringValue(formData, "pricingMode"),
    projectId: stringValue(formData, "projectId"),
    purchaseCost: stringValue(formData, "purchaseCost"),
    purchaseFxRate: stringValue(formData, "purchaseFxRate"),
    sellingCurrencyCode: stringValue(formData, "sellingCurrencyCode"),
    sellingFxRate: stringValue(formData, "sellingFxRate"),
    sellingPriceAmount: stringValue(formData, "sellingPriceAmount"),
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
