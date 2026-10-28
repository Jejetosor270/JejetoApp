import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMasterDataEditor: vi.fn(),
  createOrder: vi.fn(),
  createOrderInTransaction: vi.fn(),
  createOrderBillingLinksInTransaction: vi.fn(),
  transaction: {},
  runTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.requireMasterDataEditor,
}));
vi.mock("@/lib/reporting/revalidation", () => ({
  revalidateProjectFinancialViews: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ $transaction: mocks.runTransaction }),
}));
vi.mock("@/lib/procurement/orders", () => ({
  createOrder: mocks.createOrder,
  createOrderInTransaction: mocks.createOrderInTransaction,
}));
vi.mock("@/lib/billing/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/billing")>()),
  createOrderBillingLinksInTransaction:
    mocks.createOrderBillingLinksInTransaction,
}));

import { createOrderAction } from "./actions";
import { ClientBillingValidationError } from "@/lib/billing/billing";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const supplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const firstBillingId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondBillingId = "e12b6b9b-10e9-4e42-b93f-38796de4f65a";

function creationForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    projectId,
    supplierId,
    orderNumber: "PO-TEST",
    packageName: "PO-TEST",
    orderCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    freightTreatment: "NOT_APPLICABLE",
    pricingMode: "PROJECT_MARKUP",
    status: "DRAFT",
    purchaseCost: "100",
  }))
    form.set(key, value);
  form.set(
    "billingAllocations",
    JSON.stringify([
      {
        billingDocumentId: firstBillingId,
        basis: "FIXED_AMOUNT",
        allocatedAmount: "60",
        isProjectRemainderApproved: false,
      },
      {
        billingDocumentId: secondBillingId,
        basis: "FIXED_AMOUNT",
        allocatedAmount: "40",
        isProjectRemainderApproved: true,
      },
    ]),
  );
  return form;
}

describe("Purchasing creation Billing allocations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireMasterDataEditor.mockResolvedValue({ id: "actor" });
    mocks.createOrderInTransaction.mockResolvedValue(orderId);
    mocks.createOrder.mockResolvedValue(orderId);
    mocks.runTransaction.mockImplementation(
      async (callback: (transaction: object) => Promise<unknown>) =>
        callback(mocks.transaction),
    );
  });

  it("saves all allocations with the new Order in one serializable transaction", async () => {
    const result = await createOrderAction({}, creationForm());
    expect(result).toMatchObject({ status: "success", orderId });
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 30_000,
    });
    expect(mocks.createOrderBillingLinksInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.createOrderBillingLinksInTransaction).toHaveBeenCalledWith(
      mocks.transaction,
      "actor",
      orderId,
      [
        expect.objectContaining({
          billingDocumentId: firstBillingId,
          allocatedAmount: "60.0000",
        }),
        expect.objectContaining({
          billingDocumentId: secondBillingId,
          allocatedAmount: "40.0000",
        }),
      ],
    );
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("rejects the transaction when a later allocation fails and returns the draft error", async () => {
    mocks.createOrderBillingLinksInTransaction.mockRejectedValueOnce(
      new ClientBillingValidationError(
        "Allocation exceeds the remaining Billing document amount.",
      ),
    );
    const result = await createOrderAction({}, creationForm());
    expect(result).toMatchObject({
      status: "error",
      formError: "Allocation exceeds the remaining Billing document amount.",
    });
    expect(result.orderId).toBeUndefined();
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
  });

  it("allows an atomic allocation save to complete beyond the old five-second limit", async () => {
    vi.useFakeTimers();
    try {
      mocks.createOrderBillingLinksInTransaction.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 6_000)),
      );
      // Model Prisma's transaction deadline, retaining its five-second default.
      mocks.runTransaction.mockImplementationOnce(
        async (
          callback: (transaction: object) => Promise<unknown>,
          options?: { timeout?: number },
        ) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            return await Promise.race([
              callback(mocks.transaction),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Transaction expired")),
                  options?.timeout ?? 5_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        },
      );
      const result = createOrderAction({}, creationForm());
      await vi.advanceTimersByTimeAsync(6_000);
      expect(await result).toMatchObject({ status: "success", orderId });
      expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns row-specific validation errors before creating anything", async () => {
    const form = creationForm();
    form.set(
      "billingAllocations",
      JSON.stringify([
        {
          billingDocumentId: firstBillingId,
          basis: "FIXED_AMOUNT",
          allocatedAmount: "60",
          isProjectRemainderApproved: false,
        },
        {
          billingDocumentId: firstBillingId,
          basis: "FIXED_AMOUNT",
          allocatedAmount: "40",
          isProjectRemainderApproved: false,
        },
      ]),
    );
    const result = await createOrderAction({}, form);
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        "billingAllocations.1.billingDocumentId":
          "Choose each Billing document only once.",
      },
    });
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("supports creating without optional allocations", async () => {
    const form = creationForm();
    form.set("billingAllocations", "[]");
    expect(await createOrderAction({}, form)).toMatchObject({
      status: "success",
      orderId,
    });
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("authorizes before validation or allocation writes", async () => {
    mocks.requireMasterDataEditor.mockRejectedValueOnce(
      new Error("Unauthorized"),
    );
    await expect(createOrderAction({}, creationForm())).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});
