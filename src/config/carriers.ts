export const carriers = [
  { code: "DHL", name: "DHL" },
  { code: "FEDEX", name: "FedEx" },
  { code: "UPS", name: "UPS" },
  { code: "DPD", name: "DPD" },
  { code: "GLS", name: "GLS" },
  { code: "SCHENKER", name: "DB Schenker (DSV)" },
  { code: "KUEHNE_NAGEL", name: "Kuehne+Nagel" },
  { code: "DSV", name: "DSV" },
  { code: "MAERSK", name: "Maersk" },
  { code: "CMA_CGM", name: "CMA CGM" },
] as const;
export function carrierName(
  code: string | null | undefined,
  other: string | null | undefined,
): string {
  return code === "OTHER"
    ? other || "Other"
    : (carriers.find((carrier) => carrier.code === code)?.name ?? "—");
}
