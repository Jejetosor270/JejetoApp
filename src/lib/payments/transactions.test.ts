import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: vi.fn() }));
import { transactionQuery } from "./transactions";

it("lists actual cash once, excludes legacy settlements, and applies safe filters and pagination", async () => {
  const db = new PGlite();
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  try {
    await db.exec(`
      CREATE TABLE projects (id uuid, name text); CREATE TABLE clients (id uuid, "displayName" text); CREATE TABLE suppliers (id uuid, "displayName" text);
      CREATE TABLE client_billing_documents (id uuid, reference text, "documentType" text, "projectId" uuid, "clientId" uuid, "currencyCode" text);
      CREATE TABLE client_payment_installments (id uuid, label text);
      CREATE TABLE client_receipts (id uuid, "receivedAt" date, "billingDocumentId" uuid, "installmentId" uuid, amount numeric, reference text, notes text);
      CREATE TABLE procurement_orders (id uuid, "orderNumber" text, "projectId" uuid, "supplierId" uuid);
      CREATE TABLE payment_installments (id uuid, "orderId" uuid, label text, "currencyCode" text, direction text);
      CREATE TABLE payment_settlements (id uuid, "settledAt" date, "installmentId" uuid, amount numeric, reference text, notes text);
      INSERT INTO projects VALUES ('${id(1)}','Fictional Project'); INSERT INTO clients VALUES ('${id(2)}','Fictional Client'); INSERT INTO suppliers VALUES ('${id(3)}','Fictional Supplier');
      INSERT INTO client_billing_documents VALUES ('${id(4)}','INV-1','INVOICE','${id(1)}','${id(2)}','EUR');
      INSERT INTO client_payment_installments VALUES ('${id(5)}','Deposit');
      INSERT INTO client_receipts VALUES ('${id(6)}','2026-09-01','${id(4)}','${id(5)}',10000,'Bank in',NULL), ('${id(7)}','2026-09-02','${id(4)}',NULL,5000,'Partial',NULL);
      INSERT INTO procurement_orders VALUES ('${id(8)}','ORDER-1','${id(1)}','${id(3)}');
      INSERT INTO payment_installments VALUES ('${id(9)}','${id(8)}','Supplier deposit','EUR','SUPPLIER_PAYMENT'), ('${id(10)}','${id(8)}','Legacy client','EUR','CLIENT_RECEIPT');
      INSERT INTO payment_settlements VALUES ('${id(11)}','2026-09-03','${id(9)}',2000,'Bank out',NULL), ('${id(12)}','2026-09-04','${id(10)}',999999,'Legacy excluded',NULL);
    `);
    const run = async (params: Record<string, string>) => {
      const { query } = transactionQuery(params);
      return (
        await db.query<{
          id: string;
          amount: string;
          direction: string;
          total: number;
        }>(query.text, query.values)
      ).rows;
    };
    const all = await run({});
    expect(all).toHaveLength(3);
    expect(all.map((row) => row.amount)).toEqual(["2000", "5000", "10000"]);
    expect((await run({ direction: "IN" })).map((row) => row.amount)).toEqual([
      "5000",
      "10000",
    ]);
    expect(await run({ counterpartyId: id(3), direction: "IN" })).toEqual([]);
    expect(await run({ reference: "' OR 1=1 --" })).toEqual([]);
    expect(await run({ orderId: id(8) })).toHaveLength(1);
    expect(
      await run({ billingId: id(4), dateFrom: "2026-09-02" }),
    ).toHaveLength(1);
    expect(await run({ projectId: id(99) })).toEqual([]);
  } finally {
    await db.close();
  }
});
