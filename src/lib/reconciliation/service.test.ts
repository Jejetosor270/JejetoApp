import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  editor: vi.fn(),
  user: vi.fn(),
  audit: vi.fn(),
  cash: vi.fn(),
  importFind: vi.fn(),
  importCreate: vi.fn(),
  lineFind: vi.fn(),
  lineUpdate: vi.fn(),
  lineCount: vi.fn(),
  matchCount: vi.fn(),
  matchCreate: vi.fn(),
  matchDelete: vi.fn(),
  currency: vi.fn(),
}));
const db = {
  currency: { findUnique: mocks.currency },
  bankStatementImport: {
    findUnique: mocks.importFind,
    create: mocks.importCreate,
  },
  bankStatementLine: {
    findUnique: mocks.lineFind,
    update: mocks.lineUpdate,
    count: mocks.lineCount,
  },
  bankReconciliationMatch: {
    count: mocks.matchCount,
    createMany: mocks.matchCreate,
    deleteMany: mocks.matchDelete,
  },
  $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
    callback(db),
};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => db }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.editor,
  requireUser: mocks.user,
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("./cash", async (actual) => ({
  ...(await actual<typeof import("./cash")>()),
  readReconciliationCash: mocks.cash,
}));
import {
  confirmBankMatch,
  saveBankImport,
  unmatchBankLine,
  getBankImport,
} from "./service";

const lineId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";
const cashId = "ebf92b0e-41a2-44d7-829b-6b6c61f03898";
const version = "2026-10-01T00:00:00.000Z";
const cash = {
  kind: "CLIENT_RECEIPT",
  id: cashId,
  fingerprint: "a".repeat(64),
  currencyCode: "EUR",
  direction: "CLIENT_RECEIPT",
  amount: "120",
  date: "2026-10-01",
  href: `/receipts/${cashId}`,
  label: "Invoice",
  reference: "",
};
const input = {
  lineId,
  version,
  selections: [{ kind: cash.kind, id: cashId, fingerprint: cash.fingerprint }],
  confirmed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.editor.mockResolvedValue({ id: "actor", role: "MANAGER" });
  mocks.lineFind.mockResolvedValue({
    id: lineId,
    importId: "import",
    updatedAt: new Date(version),
    amount: "120",
    direction: "CLIENT_RECEIPT",
    statementImport: { currencyCode: "EUR", accountLabel: "Operating" },
    matches: [],
  });
  mocks.cash.mockResolvedValue([cash]);
  mocks.matchCount.mockResolvedValue(0);
  mocks.lineCount.mockResolvedValue(0);
  mocks.currency.mockResolvedValue({ code: "EUR" });
  mocks.importFind.mockResolvedValue(null);
  mocks.importCreate.mockResolvedValue({ id: "import" });
});

it.each(["current", "changed", "removed"])(
  "derives %s match validity from current cash without changing records",
  async (scenario) => {
    mocks.importFind.mockResolvedValueOnce({
      id: lineId,
      accountLabel: "Operating",
      accountKey: "operating",
      currencyCode: "EUR",
      _count: { lines: 1 },
      lines: [
        {
          id: lineId,
          updatedAt: new Date(version),
          rowNumber: 1,
          bookedAt: new Date(version),
          amount: "120",
          direction: "CLIENT_RECEIPT",
          reference: "REF",
          description: null,
          bankTransactionId: null,
          matches: [
            {
              cashKind: cash.kind,
              cashRecordId: cash.id,
              cashFingerprint: cash.fingerprint,
            },
          ],
        },
      ],
    });
    if (scenario === "changed")
      mocks.cash.mockResolvedValueOnce([
        { ...cash, fingerprint: "b".repeat(64) },
      ]);
    if (scenario === "removed") mocks.cash.mockResolvedValueOnce([]);
    mocks.lineCount.mockResolvedValueOnce(1);
    const result = await getBankImport(lineId);
    expect(result?.lines[0]?.status).toBe(
      scenario === "current" ? "MATCHED" : "NEEDS_REVIEW",
    );
    expect(result?.lines[0]?.possibleDuplicate).toBe(true);
    expect(mocks.matchCreate).not.toHaveBeenCalled();
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  },
);

describe("approved matching service", () => {
  it("writes only matching links and audit, never payments/receipts", async () => {
    await confirmBankMatch(input);
    expect(mocks.editor).toHaveBeenCalled();
    expect(mocks.matchCreate).toHaveBeenCalledWith({
      data: [
        {
          lineId,
          cashKind: "CLIENT_RECEIPT",
          cashRecordId: cashId,
          cashFingerprint: cash.fingerprint,
          createdById: "actor",
        },
      ],
    });
    expect(mocks.lineUpdate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      "actor",
      expect.objectContaining({ entityType: "BANK_RECONCILIATION" }),
    );
  });
  it.each([
    "role",
    "changed",
    "missing",
    "reused",
    "currency",
    "amount",
    "stale",
    "unconfirmed",
  ])("rejects %s without writing links", async (scenario) => {
    if (scenario === "role")
      mocks.editor.mockRejectedValueOnce(new Error("Forbidden"));
    if (scenario === "changed")
      mocks.cash.mockResolvedValueOnce([
        { ...cash, fingerprint: "b".repeat(64) },
      ]);
    if (scenario === "missing") mocks.cash.mockResolvedValueOnce([]);
    if (scenario === "reused") mocks.matchCount.mockResolvedValueOnce(1);
    if (scenario === "currency")
      mocks.cash.mockResolvedValueOnce([{ ...cash, currencyCode: "USD" }]);
    if (scenario === "amount")
      mocks.cash.mockResolvedValueOnce([{ ...cash, amount: "119.99" }]);
    await expect(
      confirmBankMatch({
        ...input,
        ...(scenario === "stale"
          ? { version: "2026-09-01T00:00:00.000Z" }
          : {}),
        ...(scenario === "unconfirmed" ? { confirmed: false } : {}),
      }),
    ).rejects.toThrow();
    expect(mocks.matchCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("unmatches audited links only, with a stale-version guard", async () => {
    await unmatchBankLine({ lineId, version, confirmed: true });
    expect(mocks.matchDelete).toHaveBeenCalledWith({ where: { lineId } });
    await expect(
      unmatchBankLine({
        lineId,
        version: "2026-09-01T00:00:00.000Z",
        confirmed: true,
      }),
    ).rejects.toThrow("changed");
    expect(mocks.matchDelete).toHaveBeenCalledTimes(1);
  });
});

describe("reviewed bank import", () => {
  const payload = {
    accountLabel: "Operating",
    currencyCode: "EUR",
    confirmed: true,
    lines: [
      {
        rowNumber: 1,
        bookedAt: "2026-10-01",
        direction: "CLIENT_RECEIPT",
        amount: "120",
        reference: "Invoice",
        description: "",
        bankTransactionId: "",
      },
    ],
  };
  it("persists normalized rows only after approval", async () => {
    await expect(saveBankImport(payload)).resolves.toEqual({
      id: "import",
      duplicate: false,
    });
    expect(mocks.importCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountKey: "operating",
        createdById: "actor",
        lines: {
          create: [
            expect.objectContaining({
              amount: "120",
              bookedAt: new Date(version),
            }),
          ],
        },
      }),
    });
    expect(mocks.audit).toHaveBeenCalled();
  });
  it("returns an identical prior import without writing duplicate rows", async () => {
    mocks.importFind.mockResolvedValueOnce({ id: "existing" });
    await expect(saveBankImport(payload)).resolves.toEqual({
      id: "existing",
      duplicate: true,
    });
    expect(mocks.importCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects missing approval/invalid currency and role bypass", async () => {
    await expect(
      saveBankImport({ ...payload, confirmed: false }),
    ).rejects.toThrow();
    mocks.currency.mockResolvedValueOnce(null);
    await expect(saveBankImport(payload)).rejects.toThrow("currency");
    mocks.editor.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(saveBankImport(payload)).rejects.toThrow("Forbidden");
    expect(mocks.importCreate).not.toHaveBeenCalled();
  });
});
