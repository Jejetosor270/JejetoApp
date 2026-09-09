import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { CellEditError, type CellEditInput } from "@/domain/listing/cell-edit";
import { billingDocumentEditSchema } from "@/domain/billing/validation";
import {
  dateOnlyToDate,
  dateToDateOnly,
  isDateOnly,
} from "@/domain/payments/dates";
import { normalizeDecimalInput } from "@/domain/validation/numeric";
import { amountIncludingVat } from "@/domain/finance/calculations";
import { writeAuditEvent } from "@/lib/audit/events";
import { updateClientBillingDocumentInTransaction } from "./billing";
import { z } from "zod";
import { scheduledAmountFromPercentage } from "@/domain/payments/calculations";

export async function editBillingCell(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: Extract<CellEditInput, { kind: "billing" }>,
) {
  const record = await tx.clientBillingDocument.findUniqueOrThrow({
    where: { id: input.id },
    include: { allocations: true },
  });
  if (record.isCancelled)
    throw new CellEditError(
      "This Billing document is cancelled. Review it in Details.",
    );
  const { field } = input;
  const previous =
    field === "documentDate" || field === "dueDate"
      ? (dateToDateOnly(record[field]) ?? "")
      : field === "totalHt"
        ? record.totalHt.toString()
        : (record[field] ?? "");
  if (previous !== input.previous)
    throw new CellEditError(
      "This value changed since you opened the table. Reload before saving; your draft is retained.",
    );
  const value = input.value.trim();
  if (
    field === "reference" ||
    field === "documentDate" ||
    field === "dueDate"
  ) {
    const data: Prisma.ClientBillingDocumentUncheckedUpdateInput = {
      updatedById: actorId,
    };
    if (field === "reference")
      data.reference = z.string().min(1).max(120).parse(value);
    else {
      if ((!value && field === "documentDate") || (value && !isDateOnly(value)))
        throw new CellEditError("Enter a valid date.");
      if (field === "documentDate") data.documentDate = dateOnlyToDate(value);
      else data.dueDate = value ? dateOnlyToDate(value) : null;
    }
    await tx.clientBillingDocument.update({ where: { id: input.id }, data });
    await writeAuditEvent(tx, actorId, {
      action: "UPDATED",
      entityType: "BILLING_DOCUMENT",
      entityId: input.id,
      entityReference: record.reference,
      summary: "Edited a Billing table cell.",
      metadata: { field, previous, value },
    });
    return;
  }
  const totalHt =
    field === "totalHt"
      ? normalizeDecimalInput(value, {
          allowNegative: false,
          maximumDecimalPlaces: 4,
        })
      : record.totalHt.toString();
  if (!totalHt)
    throw new CellEditError(
      "Enter a valid HT amount, with at most four decimal places.",
    );
  const project =
    field === "projectId"
      ? await tx.project.findUnique({ where: { id: z.uuid().parse(value) } })
      : null;
  if (field === "projectId" && !project?.clientId)
    throw new CellEditError("Select a Project assigned to a Client.");
  const values = billingDocumentEditSchema.parse({
    ...record,
    allocations: record.allocations.map((allocation) => ({
      orderId: allocation.orderId,
      allocatedAmount:
        field === "totalHt" &&
        allocation.basis === "PERCENTAGE" &&
        allocation.percentageRate
          ? scheduledAmountFromPercentage(
              totalHt,
              allocation.percentageRate.toString(),
            ).toFixed(4)
          : allocation.allocatedAmount.toString(),
      freightCoverageHt: allocation.freightCoverageHt.toString(),
      otherCoverageHt: allocation.otherCoverageHt.toString(),
      basis: allocation.basis,
      percentageRate: allocation.percentageRate?.toString(),
    })),
    totalHt,
    // Match the full editor: preserve explicitly entered VAT; TTC = HT + VAT.
    totalTtc: amountIncludingVat(totalHt, record.vatAmount.toString()).toFixed(
      4,
    ),
    vatAmount: record.vatAmount.toString(),
    vatRate: record.vatRate?.toString(),
    vatTreatment: record.vatTreatment ?? undefined,
    freightCoverageHt: record.freightCoverageHt.toString(),
    otherCoverageHt: record.otherCoverageHt.toString(),
    fxRate: record.fxRateToReporting?.toString(),
    documentDate: dateToDateOnly(record.documentDate),
    dueDate: dateToDateOnly(record.dueDate) ?? undefined,
    notes: record.notes ?? undefined,
    ...(field === "clientId" || field === "projectId"
      ? { [field]: value }
      : {}),
    ...(project ? { clientId: project.clientId } : {}),
  });
  await updateClientBillingDocumentInTransaction(tx, actorId, values);
}
