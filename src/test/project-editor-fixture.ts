import type { ComponentProps } from "react";
import type { EditProject } from "@/app/(app)/projects/[projectId]/project-detail";
import {
  reviewProjectId,
  reviewSupplierId,
} from "@/test/intake-review-fixture";

export function projectEditorFixture(): Omit<
  ComponentProps<typeof EditProject>,
  "onClose"
> {
  return {
    clients: [{ id: reviewSupplierId, displayName: "Fictional Client" }],
    currencies: [{ code: "EUR", name: "Euro" }],
    managers: [{ id: reviewSupplierId, name: "Fictional manager" }],
    statuses: ["ACTIVE", "ARCHIVED"],
    project: {
      id: reviewProjectId,
      name: "Fictional Villa",
      code: "VILLA-A",
      client: { id: reviewSupplierId, displayName: "Fictional Client" },
      clientId: reviewSupplierId,
      clientBudgetTargetHt: "100000.0000",
      estimatedPurchaseCostHt: "50000.0000",
      estimatedFreightCostHt: "5000.0000",
      expectedSellHt: null,
      defaultProductMarkupRate: "0.15",
      defaultFreightMarkupRate: "0.15",
      defaultOtherCostMarkupRate: "0",
      countryCode: "FR",
      expectedCompletionDate: "2027-05-31",
      freightEstimateNotes: "Fictional freight notes",
      freightEstimateRate: "0.1",
      notes: "Fictional project notes",
      projectManager: { id: reviewSupplierId, name: "Fictional manager" },
      projectManagerId: reviewSupplierId,
      reportingCurrencyCode: "EUR",
      reportingCurrencyLocked: true,
      startDate: "2026-09-01",
      status: "ACTIVE",
      targetMarkupRate: null,
      targetMode: "MARKUP",
    },
  };
}
