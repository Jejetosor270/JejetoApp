import { z } from "zod";

export const cashMoveKindSchema = z.enum([
  "SUPPLIER_PAYMENT",
  "CLIENT_RECEIPT",
]);
export type CashMoveKind = z.infer<typeof cashMoveKindSchema>;
export const cashMoveSchema = z.object({
  kind: cashMoveKindSchema,
  id: z.uuid(),
  targetId: z.uuid("Choose a destination."),
  sourceVersion: z.string().length(64),
  targetVersion: z.string().length(64),
  reason: z.string().trim().min(3, "Explain the correction.").max(240),
  confirmed: z.literal("yes", { error: "Confirm the reassignment." }),
});
export type CashMoveInput = z.infer<typeof cashMoveSchema>;

export interface CashMoveOptions {
  sourceVersion: string;
  sourceLabel: string;
  amount: string;
  currencyCode: string;
  projectId: string;
  search: string;
  limited: boolean;
  projects: { id: string; name: string }[];
  targets: {
    id: string;
    label: string;
    remaining: string;
    version: string;
  }[];
}
