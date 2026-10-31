import Decimal from "decimal.js";
import { z } from "zod";
import { isDateOnly } from "@/domain/payments/dates";

const amount = z
  .string()
  .regex(/^\d{1,15}(?:\.\d{1,4})?$/)
  .pipe(
    z
      .string()
      .refine((value) => new Decimal(value).gt(0), "Enter a positive amount."),
  );
const fxRate = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,10})?$/)
  .pipe(
    z
      .string()
      .refine((value) => new Decimal(value).gt(0), "Enter a positive FX rate."),
  );
const cashFields = {
  targetId: z.uuid(),
  amount,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/),
  date: z.string().refine(isDateOnly, "Use a valid YYYY-MM-DD date."),
  fxRate: fxRate.optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
};
const reason = z.string().trim().min(3).max(500);
export const cashChangeSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("RECORD_SUPPLIER_PAYMENT"),
    ...cashFields,
    amount: z.union([amount, z.literal("REMAINING")]),
  }),
  z.strictObject({
    action: z.literal("RECORD_CLIENT_RECEIPT"),
    ...cashFields,
    amount: z.union([amount, z.literal("REMAINING")]),
    installmentId: z.uuid().optional(),
  }),
  z.strictObject({
    action: z.literal("UPDATE_SUPPLIER_PAYMENT"),
    ...cashFields,
    reason,
  }),
  z.strictObject({
    action: z.literal("UPDATE_CLIENT_RECEIPT"),
    ...cashFields,
    reason,
  }),
  z.strictObject({
    action: z.literal("CANCEL_SUPPLIER_PAYMENT"),
    targetId: z.uuid(),
    reason,
  }),
  z.strictObject({
    action: z.literal("CANCEL_CLIENT_RECEIPT"),
    targetId: z.uuid(),
    reason,
  }),
]);
export type CashChange = z.infer<typeof cashChangeSchema>;

export const cashProposalReviewSchema = z.strictObject({
  proposalId: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  nonce: z.uuid(),
  expiresAt: z.iso.datetime(),
  actorId: z.uuid(),
  tokenId: z.uuid(),
  action: z.string().min(1).max(80),
  summary: z.string().min(1).max(1500),
  changes: z
    .array(
      z.strictObject({
        label: z.string().max(100),
        before: z.string().max(5000).optional(),
        after: z.string().max(5000),
      }),
    )
    .max(20),
  sourceHref: z.url(),
});
export type CashProposalReview = z.infer<typeof cashProposalReviewSchema>;

export const cashSavedResultSchema = z.strictObject({
  status: z.literal("EXECUTED"),
  proposalId: z.uuid(),
  action: z.string().min(1).max(80),
  resultId: z.uuid(),
  alreadyExecuted: z.boolean(),
  sourceHref: z.url(),
  message: z.string().min(1).max(1500),
});
export type CashSavedResult = z.infer<typeof cashSavedResultSchema>;

/** The bridge signs this exact expiring challenge only after native human approval. */
export function approvalMessage(
  proposal: CashProposalReview,
  approvedAt: string,
): string {
  return JSON.stringify({
    protocol: "mb-erp-cash-v1",
    proposalId: proposal.proposalId,
    digest: proposal.digest,
    nonce: proposal.nonce,
    expiresAt: proposal.expiresAt,
    actorId: proposal.actorId,
    tokenId: proposal.tokenId,
    approvedAt,
  });
}

export const cashApiRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("prepare"), change: cashChangeSchema }),
  z.strictObject({ operation: z.literal("review"), proposalId: z.uuid() }),
  z.strictObject({
    operation: z.literal("execute"),
    proposalId: z.uuid(),
    approvedAt: z.iso.datetime(),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  }),
]);
