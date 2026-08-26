export const auditActions = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "ACTIVATED",
  "DEACTIVATED",
  "ARCHIVED",
  "PASSWORD_RESET",
  "IMPORTED",
] as const;
export type AuditAction = (typeof auditActions)[number];

export const auditEntityTypes = [
  "USER",
  "CLIENT",
  "SUPPLIER",
  "PROJECT",
  "BUILDING",
  "ORDER",
  "INSTALLMENT",
  "SETTLEMENT",
  "QUOTE_IMPORT",
  "SETTING",
] as const;
export type AuditEntityType = (typeof auditEntityTypes)[number];
