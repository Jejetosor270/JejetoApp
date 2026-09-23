/** Visual semantics only. The caller remains authoritative for status and wording. */
export function recordStatusTone(status: string) {
  switch (status) {
    case "PAID":
    case "SETTLED":
    case "RECEIVED":
      return "success";
    case "OVERDUE":
      return "destructive";
    case "PARTIALLY_PAID":
    case "TO_BE_INVOICED":
      return "warning";
    case "INVOICED":
      return "info";
    default:
      return "neutral";
  }
}
