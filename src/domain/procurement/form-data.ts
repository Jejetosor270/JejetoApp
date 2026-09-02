function stringValue(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function orderFormValues(formData: FormData) {
  return {
    actualDeliveryDate: stringValue(formData, "actualDeliveryDate"),
    buildingIds: formData
      .getAll("buildingIds")
      .filter((value): value is string => typeof value === "string"),
    category: stringValue(formData, "category"),
    customsDuties: stringValue(formData, "customsDuties"),
    description: stringValue(formData, "description"),
    expectedDeliveryDate: stringValue(formData, "expectedDeliveryDate"),
    expectedReadyDate: stringValue(formData, "expectedReadyDate"),
    freight: stringValue(formData, "freight"),
    freightMarkupOverrideRate: stringValue(
      formData,
      "freightMarkupOverridePercent",
    ),
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
    otherCostMarkupOverrideRate: stringValue(
      formData,
      "otherCostMarkupOverridePercent",
    ),
    leadTimeWeeks: stringValue(formData, "leadTimeWeeks"),
    notes: stringValue(formData, "notes"),
    orderCurrencyCode: stringValue(formData, "orderCurrencyCode"),
    orderNumber: stringValue(formData, "orderNumber"),
    orderDate: stringValue(formData, "orderDate"),
    outputVatAmount: stringValue(formData, "outputVatAmount"),
    outputVatCountryCode: stringValue(formData, "outputVatCountryCode"),
    outputVatCustomTreatmentNote: stringValue(
      formData,
      "outputVatCustomTreatmentNote",
    ),
    outputVatRate: stringValue(formData, "outputVatRate"),
    outputVatTaxableBaseOverride: stringValue(
      formData,
      "outputVatTaxableBaseOverride",
    ),
    outputVatTreatment: stringValue(formData, "outputVatTreatment"),
    packageName: stringValue(formData, "packageName"),
    pricingMode: stringValue(formData, "pricingMode"),
    projectId: stringValue(formData, "projectId"),
    purchaseCost: stringValue(formData, "purchaseCost"),
    productMarkupOverrideRate: stringValue(
      formData,
      "productMarkupOverridePercent",
    ),
    purchaseFxRate: stringValue(formData, "purchaseFxRate"),
    quoteDate: stringValue(formData, "quoteDate"),
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
