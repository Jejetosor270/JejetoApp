"use client";

import {
  Field,
  MoneyInput,
  PercentageInput,
} from "@/components/master-data/form-ui";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";

/** Three entry perspectives, all resolving to the single persisted HT amount. */
export function AllocationInputs({
  otherCoverageHt,
  onOtherChange,
  freightCoverageHt,
  onFreightChange,
  amount,
  onAmountChange,
  billingTotalHt,
  orderSellHt,
  currencyCode,
  name = "allocatedAmount",
  error,
}: {
  otherCoverageHt?: string;
  onOtherChange?: (amount: string) => void;
  freightCoverageHt?: string;
  onFreightChange?: (amount: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  billingTotalHt: string;
  orderSellHt: string | null;
  currencyCode: string;
  name?: string;
  error?: string | undefined;
}) {
  return (
    <>
      {onFreightChange && (
        <Field label={`Of allocation: freight HT (${currencyCode})`}>
          <MoneyInput
            name={`${name}.freightCoverageHt`}
            value={freightCoverageHt ?? "0"}
            onValueChange={onFreightChange}
          />
          <span className="text-muted-foreground text-xs">
            Included in allocation HT, not added to it.
          </span>
        </Field>
      )}
      {onOtherChange && (
        <Field label={`Of allocation: Other/services HT (${currencyCode})`}>
          <MoneyInput
            name={`${name}.otherCoverageHt`}
            value={otherCoverageHt ?? "0"}
            onValueChange={onOtherChange}
          />
        </Field>
      )}
      <Field label={`Allocation HT (${currencyCode})`} error={error}>
        <MoneyInput
          name={name}
          value={amount}
          onValueChange={onAmountChange}
          required
        />
      </Field>
      <Field label="% of Billing">
        <PercentageInput
          value={percentageFromAmount(billingTotalHt, amount) ?? ""}
          onValueChange={(percentage) =>
            onAmountChange(
              amountFromPercentage(billingTotalHt, percentage) ?? "",
            )
          }
        />
      </Field>
      <Field label="% of Order covered">
        <PercentageInput
          disabled={
            orderSellHt === null ||
            percentageFromAmount(orderSellHt, "0") === null
          }
          value={percentageFromAmount(orderSellHt ?? "", amount) ?? ""}
          onValueChange={(percentage) =>
            onAmountChange(
              amountFromPercentage(orderSellHt ?? "", percentage) ?? "",
            )
          }
        />
        {orderSellHt === null ? (
          <span className="text-muted-foreground text-xs">
            Select an Order with a comparable selling amount and complete manual
            FX.
          </span>
        ) : null}
      </Field>
    </>
  );
}
