"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EditorDrawer, EditorActions } from "@/components/forms/editor-drawer";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { importBankAction } from "@/app/(app)/reports/reconciliation/actions";
import {
  mapBankRows,
  parseBankCsv,
  type CsvMapping,
} from "@/domain/reconciliation/csv";
import {
  MAX_CSV_BYTES,
  ReconciliationError,
  type BankLine,
} from "@/domain/reconciliation/schema";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";

const defaultMapping: CsvMapping = {
  date: -1,
  amount: -1,
  debit: -1,
  credit: -1,
  reference: -1,
  description: -1,
  transactionId: -1,
  dateFormat: "ISO",
  decimalSeparator: ".",
  amountMode: "SIGNED",
};
const mappingLabels = {
  date: "Booking date",
  amount: "Signed amount (+ in, − out)",
  debit: "Debit / money out",
  credit: "Credit / money in",
  reference: "Reference (optional)",
  description: "Description (optional)",
  transactionId: "Bank transaction ID (optional)",
};
type ColumnKey = keyof typeof mappingLabels;

export function ImportBank({ currencies }: { currencies: readonly string[] }) {
  return (
    <EditorDrawer
      title="Import bank CSV"
      size="wide"
      description="Review a UTF-8 CSV before saving structured bank rows. Files are never uploaded or retained. No cash records are created."
    >
      <ImportBankForm currencies={currencies} />
    </EditorDrawer>
  );
}

export function ImportBankForm({
  currencies,
}: {
  currencies: readonly string[];
}) {
  const router = useRouter();
  const [accountLabel, setAccountLabel] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [delimiter, setDelimiter] = useState<"," | ";" | "\t">(",");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvMapping>(defaultMapping);
  const [preview, setPreview] = useState<BankLine[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  function changeMapping(patch: Partial<CsvMapping>) {
    setMapping((current) => ({ ...current, ...patch }));
    setPreview([]);
    setError("");
    setReviewed(false);
  }
  async function readFile(file: File | undefined) {
    if (busy.current) return;
    setPreview([]);
    setRows([]);
    setError("");
    setMessage("");
    setMapping(defaultMapping);
    setReviewed(false);
    if (!file) return;
    busy.current = true;
    setPending(true);
    try {
      if (
        !file.name.toLowerCase().endsWith(".csv") ||
        file.size > MAX_CSV_BYTES
      )
        throw new ReconciliationError(
          "Choose a UTF-8 CSV file no larger than 4 MiB.",
        );
      setRows(parseBankCsv(await file.text(), delimiter));
    } catch (caught) {
      setError(
        caught instanceof ReconciliationError
          ? caught.message
          : "This CSV could not be read.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <form
      ref={form}
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current || !preview.length || !reviewed) return;
        busy.current = true;
        setPending(true);
        setError("");
        try {
          const result = await importBankAction({
            accountLabel,
            currencyCode,
            lines: preview,
            confirmed: true,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setRows([]);
          setPreview([]);
          setMessage(
            result.duplicate
              ? "This reviewed import already exists; no duplicate rows were saved."
              : "Reviewed bank rows saved. Existing cash remains unchanged.",
          );
          if (form.current) form.current.dataset.dirty = "false";
          router.push(`/reports/reconciliation?import=${result.id}`);
          router.refresh();
        } catch {
          setError(
            "Import could not be saved. Your reviewed rows are preserved.",
          );
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterField label="Account label">
          <input
            className={filterControlClassName}
            name="accountLabel"
            value={accountLabel}
            maxLength={120}
            required
            disabled={pending}
            onChange={(event) => {
              setAccountLabel(event.target.value);
              setReviewed(false);
            }}
            placeholder="Operating account"
          />
        </FilterField>
        <FilterField label="Account currency">
          <select
            className={filterControlClassName}
            name="currencyCode"
            required
            disabled={pending}
            value={currencyCode}
            onChange={(event) => {
              setCurrencyCode(event.target.value);
              setReviewed(false);
            }}
          >
            <option value="">Choose currency</option>
            {currencies.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="CSV delimiter">
          <select
            className={filterControlClassName}
            value={delimiter}
            disabled={pending}
            onChange={(event) => {
              setDelimiter(event.target.value as typeof delimiter);
              setRows([]);
              setPreview([]);
              setReviewed(false);
            }}
          >
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value={"\t"}>Tab</option>
          </select>
        </FilterField>
      </div>
      <FilterField label="Choose CSV (maximum 1,000 rows)">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
      </FilterField>
      {rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterField label="Date format">
              <select
                className={filterControlClassName}
                value={mapping.dateFormat}
                disabled={pending}
                onChange={(event) =>
                  changeMapping({
                    dateFormat: event.target.value as CsvMapping["dateFormat"],
                  })
                }
              >
                <option value="ISO">YYYY-MM-DD</option>
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
              </select>
            </FilterField>
            <FilterField label="Decimal convention">
              <select
                className={filterControlClassName}
                value={mapping.decimalSeparator}
                disabled={pending}
                onChange={(event) =>
                  changeMapping({
                    decimalSeparator: event.target.value as "." | ",",
                  })
                }
              >
                <option value=".">1234.56 (decimal point)</option>
                <option value=",">1234,56 (decimal comma)</option>
              </select>
            </FilterField>
            <FilterField label="Amount columns">
              <select
                className={filterControlClassName}
                value={mapping.amountMode}
                disabled={pending}
                onChange={(event) =>
                  changeMapping({
                    amountMode: event.target.value as CsvMapping["amountMode"],
                  })
                }
              >
                <option value="SIGNED">One signed amount</option>
                <option value="DEBIT_CREDIT">Separate debit / credit</option>
              </select>
            </FilterField>
            {(Object.keys(mappingLabels) as ColumnKey[])
              .filter((key) =>
                mapping.amountMode === "SIGNED"
                  ? key !== "debit" && key !== "credit"
                  : key !== "amount",
              )
              .map((key) => (
                <FilterField key={key} label={mappingLabels[key]}>
                  <select
                    className={filterControlClassName}
                    name={`mapping-${key}`}
                    value={mapping[key]}
                    disabled={pending}
                    onChange={(event) =>
                      changeMapping({ [key]: Number(event.target.value) })
                    }
                  >
                    <option value={-1}>Choose column</option>
                    {rows[0]?.map((header, index) => (
                      <option key={index} value={index}>
                        {index + 1}. {header || "Unnamed"}
                      </option>
                    ))}
                  </select>
                </FilterField>
              ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Use booked transactions only. Positive amounts mean money in.
            Negative amounts mean money out. Spaces may group digits;
            punctuation grouping separators and mixed-currency rows are not
            supported. Choose the currency of the booked bank amount.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              try {
                setPreview(mapBankRows(rows, mapping));
                setReviewed(false);
                setError("");
              } catch (caught) {
                setError(
                  caught instanceof ReconciliationError
                    ? caught.message
                    : "Check the column mapping.",
                );
              }
            }}
          >
            Preview mapped rows
          </Button>
        </>
      )}
      {preview.length > 0 && (
        <section className="space-y-3" aria-label="Reviewed bank rows">
          <p className="text-sm font-medium">
            Review all {preview.length} rows before confirming
          </p>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Reference / description</th>
                  <th className="p-2 text-left">Direction</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((line) => (
                  <tr key={line.rowNumber} className="border-t">
                    <td className="p-2 whitespace-nowrap">
                      {formatDateOnly(line.bookedAt)}
                    </td>
                    <td className="p-2 break-words">
                      {line.reference || "—"}
                      <div className="text-muted-foreground text-xs">
                        {line.description}
                      </div>
                    </td>
                    <td className="p-2">
                      {line.direction === "CLIENT_RECEIPT"
                        ? "Money in"
                        : "Money out"}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap tabular-nums">
                      {currencyCode
                        ? formatMoney(line.amount, currencyCode)
                        : line.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="confirmed"
              required
              disabled={pending}
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the account, currency, dates, directions and amounts.
            Save these bank rows for matching only.
          </label>
          <EditorActions>
            <Button disabled={pending}>
              {pending ? "Saving…" : "Confirm import"}
            </Button>
          </EditorActions>
        </section>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
