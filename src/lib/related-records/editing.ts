import type { RelatedEditKind, RelatedTableData } from "./types";
const editKinds: Record<string, RelatedEditKind> = {
  projects: "project",
  clients: "client",
  suppliers: "supplier",
  orders: "order",
  billing: "billing",
  revisions: "billing",
  payments: "payment",
  receipts: "receipt",
  "supplier-installments": "supplier-installment",
  "client-installments": "client-installment",
  buildings: "building",
  rooms: "room",
  items: "item",
  packages: "package",
};
export function editableRelatedTables(tables: RelatedTableData[]) {
  for (const table of tables) {
    const kind = editKinds[table.id];
    if (kind) table.editKind = kind;
    if (table.id === "payments") table.removal = { kind: "payment" };
    if (table.id === "receipts") table.removal = { kind: "receipt" };
  }
  return tables;
}
