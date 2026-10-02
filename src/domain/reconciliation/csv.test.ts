import { describe, expect, it } from "vitest";
import { mapBankRows, parseBankCsv, type CsvMapping } from "./csv";
import {
  bankImportSchema,
  matchSchema,
  MAX_CSV_BYTES,
  validateMatch,
  type CashCandidate,
} from "./schema";

const mapping: CsvMapping = {
  date: 0,
  amount: 1,
  debit: -1,
  credit: -1,
  reference: 2,
  description: 3,
  transactionId: -1,
  amountMode: "SIGNED",
  dateFormat: "ISO",
  decimalSeparator: ".",
};
describe("bounded deterministic bank CSV", () => {
  it("preserves quoted delimiters, quotes, newlines, BOM and formula-like references as inert text", () => {
    const rows = parseBankCsv(
      '\uFEFFDate,Amount,Reference,Description\r\n2026-10-01,-120.50,"INV, 1","two\nlines ""quoted"""\r\n2026-10-02,20,=SUM(A1),',
      ",",
    );
    const lines = mapBankRows(rows, mapping);
    expect(lines[0]).toMatchObject({
      direction: "SUPPLIER_PAYMENT",
      amount: "120.5",
      reference: "INV, 1",
      description: 'two\nlines "quoted"',
    });
    expect(lines[1]).toMatchObject({
      direction: "CLIENT_RECEIPT",
      amount: "20",
      reference: "=SUM(A1)",
    });
  });
  it("uses explicit European dates and decimal convention without guessing", () => {
    const rows = parseBankCsv(
      "Date;Amount;Reference;Description\n01/10/2026;1 234,5678;REF;Test",
      ";",
    );
    expect(
      mapBankRows(rows, {
        ...mapping,
        dateFormat: "DMY",
        decimalSeparator: ",",
      })[0],
    ).toMatchObject({ bookedAt: "2026-10-01", amount: "1234.5678" });
    expect(() => mapBankRows(rows, mapping)).toThrow("Row 2");
  });
  it("supports separate positive debit and credit", () => {
    const rows = parseBankCsv(
      "Date,Debit,Credit\n2026-10-01,25,\n2026-10-02,,40",
      ",",
    );
    const lines = mapBankRows(rows, {
      ...mapping,
      amountMode: "DEBIT_CREDIT",
      debit: 1,
      credit: 2,
      reference: -1,
      description: -1,
    });
    expect(lines.map(({ amount, direction }) => [amount, direction])).toEqual([
      ["25", "SUPPLIER_PAYMENT"],
      ["40", "CLIENT_RECEIPT"],
    ]);
  });
  it.each(["0", "1.12345", "1000000000000000", "1,234.56", "NaN", "1e2"])(
    "rejects unsupported amount %s",
    (amount) => {
      expect(() =>
        mapBankRows(
          [
            ["Date", "Amount"],
            ["2026-10-01", amount],
          ],
          { ...mapping, reference: -1, description: -1 },
        ),
      ).toThrow();
    },
  );
  it.each(["2026-02-30", "02/03/2026", "2026-1-1"])(
    "rejects invalid/ambiguous ISO dates %s",
    (date) => {
      expect(() =>
        mapBankRows(
          [
            ["Date", "Amount"],
            [date, "10"],
          ],
          { ...mapping, reference: -1, description: -1 },
        ),
      ).toThrow("Row 2");
    },
  );
  it("rejects ambiguous dual debit/credit, negative debit and missing/duplicate columns", () => {
    const map = {
      ...mapping,
      amountMode: "DEBIT_CREDIT" as const,
      debit: 1,
      credit: 2,
      reference: -1,
      description: -1,
    };
    for (const pair of [
      ["10", "10"],
      ["-10", ""],
      ["", ""],
    ])
      expect(() =>
        mapBankRows(
          [
            ["Date", "Debit", "Credit"],
            ["2026-10-01", ...pair],
          ],
          map,
        ),
      ).toThrow();
    expect(() =>
      mapBankRows(
        [
          ["Date", "Amount"],
          ["2026-10-01", "10"],
        ],
        { ...mapping, amount: 0 },
      ),
    ).toThrow("Map separate");
  });
  it.each([
    'Date,Amount\n"2026-10-01,10',
    'Date,Amount\n2026-10-01,"10"x',
    "Date,Amount\n2026-10-01,10,extra",
    "Date,Amount\n2026-10-01,\0",
  ])("rejects malformed/binary CSV", (text) =>
    expect(() => parseBankCsv(text, ",")).toThrow(),
  );
  it("enforces file/row bounds", () => {
    expect(() => parseBankCsv("x".repeat(MAX_CSV_BYTES + 1), ",")).toThrow(
      "4 MiB",
    );
    expect(() =>
      parseBankCsv(`Date,Amount\n${"2026-10-01,1\n".repeat(1001)}`, ","),
    ).toThrow("1,000".replace(",", ""));
  });
  it("does not discard legitimately identical transactions", () => {
    const rows = parseBankCsv("Date,Amount\n2026-10-01,10\n2026-10-01,10", ",");
    const lines = mapBankRows(rows, {
      ...mapping,
      reference: -1,
      description: -1,
    });
    expect(lines).toHaveLength(2);
    expect(
      bankImportSchema.parse({
        accountLabel: "Operating",
        currencyCode: "EUR",
        lines,
        confirmed: true,
      }).lines,
    ).toHaveLength(2);
  });
});

const candidate = (id: string, amount: string): CashCandidate => ({
  id,
  amount,
  kind: "CLIENT_RECEIPT",
  currencyCode: "EUR",
  direction: "CLIENT_RECEIPT",
  date: "2026-10-01",
  reference: "",
  label: "Invoice",
  href: "/receipts/example",
  fingerprint: "a".repeat(64),
});
describe("existing-cash matching", () => {
  const line = {
    amount: "0.3",
    direction: "CLIENT_RECEIPT" as const,
    currencyCode: "EUR",
  };
  it("matches multiple cash amounts exactly with Decimal", () =>
    expect(() =>
      validateMatch(line, [candidate("one", "0.1"), candidate("two", "0.2")]),
    ).not.toThrow());
  it("rejects partial, over, empty and reused cash", () => {
    for (const rows of [
      [],
      [candidate("one", "0.2")],
      [candidate("one", "0.4")],
      [candidate("one", "0.15"), candidate("one", "0.15")],
    ])
      expect(() => validateMatch(line, rows)).toThrow();
  });
  it("never converts or matches different currencies/directions", () => {
    expect(() =>
      validateMatch(line, [
        { ...candidate("one", "0.3"), currencyCode: "USD" },
      ]),
    ).toThrow("same currency and direction");
    expect(() =>
      validateMatch(line, [
        { ...candidate("one", "0.3"), direction: "SUPPLIER_PAYMENT" },
      ]),
    ).toThrow("same currency and direction");
  });
  it("requires employee confirmation and unique selected cash", () => {
    const selection = {
      kind: "CLIENT_RECEIPT",
      id: "d12b6b9b-10e9-4e42-b93f-38796de4f65a",
      fingerprint: "a".repeat(64),
    };
    const base = {
      lineId: selection.id,
      version: "2026-10-01T00:00:00.000Z",
      selections: [selection],
      confirmed: true,
    };
    expect(matchSchema.safeParse(base).success).toBe(true);
    expect(matchSchema.safeParse({ ...base, confirmed: false }).success).toBe(
      false,
    );
    expect(
      matchSchema.safeParse({ ...base, selections: [selection, selection] })
        .success,
    ).toBe(false);
  });
});
