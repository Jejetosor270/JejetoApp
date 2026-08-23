function value(formData: FormData, name: string): string | undefined {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : undefined;
}

export function installmentFormValues(formData: FormData) {
  return {
    basis: value(formData, "basis"),
    currencyCode: value(formData, "currencyCode"),
    direction: value(formData, "direction"),
    dueDate: value(formData, "dueDate"),
    expectedFxRate: value(formData, "expectedFxRate"),
    fixedAmount: value(formData, "fixedAmount"),
    id: value(formData, "id"),
    label: value(formData, "label"),
    notes: value(formData, "notes"),
    orderId: value(formData, "orderId"),
    percentageRate: value(formData, "percentageRate"),
  };
}

export function settlementFormValues(formData: FormData) {
  return {
    amount: value(formData, "amount"),
    fxRate: value(formData, "fxRate"),
    installmentId: value(formData, "installmentId"),
    notes: value(formData, "notes"),
    reference: value(formData, "reference"),
    settledAt: value(formData, "settledAt"),
  };
}

export function idFormValue(formData: FormData, name: string) {
  return { [name]: value(formData, name) };
}
