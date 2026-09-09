// @vitest-environment happy-dom
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  insertTestVat,
  orderVatDatabase,
  vatConstraintMigration,
  type TestVatEntry,
} from "@/test/order-vat-database";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import {
  intakeOptions,
  intakeReview,
  reviewBillingId,
  reviewOrderId,
  reviewProjectId,
  reviewSupplierId,
} from "@/test/intake-review-fixture";

const storage = vi.hoisted(() => ({
  $transaction: vi.fn(),
  applicationSetting: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  supplier: { findFirst: vi.fn(), findUnique: vi.fn() },
  currency: { findFirst: vi.fn() },
  procurementOrder: { create: vi.fn() },
  procurementOrderCostLine: { deleteMany: vi.fn(), createMany: vi.fn() },
  procurementOrderVatEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
  user: { findUnique: vi.fn() },
  auditEvent: { create: vi.fn() },
  supplierQuoteImport: { create: vi.fn() },
  paymentInstallment: { create: vi.fn(), createMany: vi.fn() },
  item: { create: vi.fn() },
}));
const framework = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireMasterDataEditor: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: framework.revalidatePath }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: framework.requireMasterDataEditor,
}));
vi.mock("@/lib/db", () => ({ getDatabase: () => storage }));

import { QuoteReview } from "./quote-intake";
import { confirmSupplierQuoteAction } from "@/app/(app)/orders/import/actions";
import { Prisma } from "@/generated/prisma/client";

describe("actual V2 review → FormData → action → Order/VAT/audit confirmation", () => {
  let database: Awaited<ReturnType<typeof orderVatDatabase>>;
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeAll(async () => {
    database = await orderVatDatabase();
    await database.exec(vatConstraintMigration);
  }, 30000);
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    framework.requireMasterDataEditor.mockResolvedValue({
      id: reviewSupplierId,
    });
    storage.applicationSetting.findUnique.mockResolvedValue({
      itemManagementEnabled: false,
    });
    storage.project.findUnique.mockResolvedValue(intakeOptions().projects[0]);
    storage.supplier.findFirst.mockResolvedValue({ id: reviewSupplierId });
    storage.supplier.findUnique.mockResolvedValue({ id: reviewSupplierId });
    storage.currency.findFirst.mockResolvedValue({ code: "EUR" });
    storage.procurementOrder.create.mockResolvedValue({ id: reviewOrderId });
    storage.user.findUnique.mockResolvedValue({
      id: reviewSupplierId,
      name: "Fictional employee",
      email: "employee@example.test",
    });
    storage.procurementOrderVatEntry.createMany.mockImplementation(
      async ({ data }: { data: TestVatEntry[] }) => {
        for (const entry of data) await insertTestVat(database, entry);
      },
    );
    storage.$transaction.mockImplementation(
      async (callback: (tx: typeof storage) => Promise<string>) => {
        await database.exec("BEGIN");
        try {
          const result = await callback(storage);
          await database.exec("COMMIT");
          return result;
        } catch (error) {
          await database.exec("ROLLBACK");
          throw error;
        }
      },
    );
  });
  afterEach(async () => {
    await view?.unmount();
    vi.restoreAllMocks();
  });

  async function review(vat: boolean, items = false, enabled = false) {
    view = await mountForm(
      createElement(QuoteReview, {
        options: intakeOptions(enabled),
        review: intakeReview(vat, items),
      }),
    );
    await enter("orderNumber", "PO-FICTIONAL-1");
    await enter("inputVatTreatment", vat ? "DOMESTIC" : "EXEMPT");
    if (vat) await enter("inputVatRecoverablePercent", "100");
  }

  it.each([true, false])(
    "saves through the real submit button with VAT=%s, blank Billing, no approved schedule and Items disabled",
    async (vat) => {
      await review(vat, true);
      expect(document.querySelector('[name="approveItems"]')).toBeNull();
      const form = control("orderNumber").form;
      expect(form).not.toBeNull();
      const data = new FormData(form ?? undefined);
      expect(data.get("billingDocumentId")).toBe("");
      await clickText("Confirm and save Order");
      expect(view.container.textContent).toContain("Order import saved");
      expect(
        view.container.querySelector('a[href="/orders/' + reviewOrderId + '"]'),
      ).not.toBeNull();
      expect(storage.procurementOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: reviewProjectId,
            supplierId: reviewSupplierId,
            pricingMode: "PROJECT_MARKUP",
            orderCurrencyCode: "EUR",
          }),
        }),
      );
      expect(storage.procurementOrderVatEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            vatAmount: vat ? "10000.0000" : "0.0000",
            recoverableRate: vat ? "1.000000" : null,
          }),
        ],
      });
      expect(storage.auditEvent.create).toHaveBeenCalledTimes(2);
      expect(storage.supplierQuoteImport.create).toHaveBeenCalledOnce();
      expect(storage.paymentInstallment.createMany).not.toHaveBeenCalled();
      expect(storage.item.create).not.toHaveBeenCalled();
      expect(framework.revalidatePath).toHaveBeenCalledWith(
        `/orders/${reviewOrderId}`,
      );
    },
  );

  it("preserves the entire edited draft on server validation failure, without another extraction", async () => {
    await review(true, true, true);
    await enter("supplierQuoteReference", "Employee reference");
    await enter("billingDocumentId", reviewBillingId);
    await enter("billingAllocatedAmount", "1234.50");
    await enter("payment.0.label", "Employee payment proposal");
    await enter("inputVatAmount", "bad amount");
    const form = control("orderNumber").form;
    const before = [...new FormData(form ?? undefined)];
    await clickText("Confirm and save Order");
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.container.textContent).toContain(
      "Enter a non-negative amount with up to four decimal places.",
    );
    expect([...new FormData(form ?? undefined)]).toEqual(before);
    expect(view.container.textContent).toContain("Review and correct");
    expect(control("supplierId").value).toBe(reviewSupplierId);
    expect(control("projectId").value).toBe(reviewProjectId);
    expect(control("payment.0.label").value).toBe("Employee payment proposal");
    expect(control("quoteItems").value).toContain("Fictional chair");
    expect(storage.$transaction).not.toHaveBeenCalled();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
  });

  it("ignores stale Item approval when Beta has been disabled, while confirming the aggregate Order", async () => {
    await review(false, true, true);
    const result = await confirmSupplierQuoteAction(
      {},
      new FormData(control("orderNumber").form ?? undefined),
    );
    expect(result.status).toBe("success");
    expect(result.message).toContain("Items were not imported");
    expect(storage.item.create).not.toHaveBeenCalled();
  });

  it("keeps unexpected database errors safe and logs only bounded metadata", async () => {
    await review(false);
    storage.procurementOrderVatEntry.createMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "SQL confidential document data",
        { code: "P2039", clientVersion: "test" },
      ),
    );
    await clickText("Confirm and save Order");
    expect(view.container.textContent).toContain(
      "Your review is still available",
    );
    expect(view.container.textContent).not.toContain("SQL confidential");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "SQL confidential",
    );
    expect(console.error).toHaveBeenCalledWith(
      "supplier_order_import.failed",
      expect.objectContaining({ databaseErrorCode: "P2039" }),
    );
    expect(control("orderNumber").value).toBe("PO-FICTIONAL-1");
  });

  it("returns a specific relation error without writing an Order or losing the review", async () => {
    await review(false);
    storage.currency.findFirst.mockResolvedValueOnce(null);
    await clickText("Confirm and save Order");
    expect(view.container.textContent).toContain(
      "Choose valid active project, supplier, and currencies.",
    );
    expect(control("orderNumber").value).toBe("PO-FICTIONAL-1");
    expect(storage.procurementOrder.create).not.toHaveBeenCalled();
    expect(storage.auditEvent.create).not.toHaveBeenCalled();
  });

  it("returns an actionable FX validation error instead of throwing during Decimal conversion", async () => {
    await review(false);
    await enter("purchaseFxRate", "invalid FX");
    await clickText("Confirm and save Order");
    expect(view.container.textContent).toContain(
      "Enter a positive FX rate with up to ten decimal places.",
    );
    expect(control("purchaseFxRate").value).toBe("invalid FX");
    expect(storage.$transaction).not.toHaveBeenCalled();
  });

  it("identifies the outdated VAT constraint safely without asking employees to change their financial selections", async () => {
    await review(false);
    storage.procurementOrderVatEntry.createMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'violates check constraint "order_vat_entries_recoverability_check"',
        { code: "P2039", clientVersion: "test" },
      ),
    );
    await clickText("Confirm and save Order");
    expect(view.container.textContent).toContain(
      "The VAT setup needs an administrator update",
    );
    expect(view.container.textContent).not.toContain(
      "order_vat_entries_recoverability_check",
    );
    expect(console.error).toHaveBeenCalledWith(
      "supplier_order_import.failed",
      expect.objectContaining({
        errorClassification: "vat_recoverability_constraint",
        databaseErrorCode: "P2039",
      }),
    );
    expect(control("inputVatTreatment").value).toBe("EXEMPT");
  });
});
