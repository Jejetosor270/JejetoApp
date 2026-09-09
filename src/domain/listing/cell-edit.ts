import { z } from "zod";
export const orderCellFields = [
  "orderNumber",
  "status",
  "invoiceDate",
  "expectedReadyDate",
  "expectedDeliveryDate",
  "trackingReference",
  "carrierCode",
  "carrierOtherName",
  "projectId",
  "supplierId",
  "packageId",
  "purchaseCost",
] as const;
export const billingCellFields = [
  "reference",
  "documentDate",
  "dueDate",
  "projectId",
  "clientId",
  "totalHt",
] as const;
export const cellEditSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("order"),
      id: z.uuid(),
      field: z.enum(orderCellFields),
      value: z.string().max(500),
      previous: z.string().max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("billing"),
      id: z.uuid(),
      field: z.enum(billingCellFields),
      value: z.string().max(500),
      previous: z.string().max(500),
    })
    .strict(),
]);
export type CellEditInput = z.infer<typeof cellEditSchema>;
export class CellEditError extends Error {}
