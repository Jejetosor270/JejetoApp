import type { Prisma } from "@/generated/prisma/client";

/** Preserve matched Quote receipts once, while requiring an active Invoice context. */
export const recognizedReceiptWhere = {
  OR: [
    {
      billingDocument: {
        documentType: "INVOICE",
        isCancelled: false,
        workflowStatus: { notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"] },
      },
    },
    {
      installment: {
        matchedInvoices: {
          some: { documentType: "INVOICE", isCancelled: false },
        },
      },
    },
  ],
} satisfies Prisma.ClientReceiptWhereInput;
