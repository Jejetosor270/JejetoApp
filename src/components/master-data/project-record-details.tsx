import { projectFreightBudget } from "@/domain/freight/calculations";
import type { ProjectView } from "@/app/(app)/projects/[projectId]/project-detail";
import {
  RecordFields,
  RecordSectionHeading,
} from "@/components/layout/record-presentation";
import { countries } from "@/config/countries";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";

export function ProjectRecordDetails({ project }: { project: ProjectView }) {
  const money = (value: ProjectView["estimatedPurchaseCostHt"]) =>
    formatMoney(value?.toString() ?? null, project.reportingCurrencyCode);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="bg-card rounded-lg border p-4">
          <RecordSectionHeading title="General & dates" />
          <RecordFields
            values={[
              { label: "Client", value: project.client.displayName },
              {
                label: "Project manager",
                value: project.projectManager?.name ?? "—",
              },
              { label: "Status", value: formatEnumLabel(project.status) },
              {
                label: "Country",
                value:
                  countries.find(
                    (country) => country.code === project.countryCode,
                  )?.label ?? "—",
              },
              {
                label: "Reporting currency",
                value: project.reportingCurrencyCode,
              },
              {
                label: "Start date",
                value: formatDateOnly(project.startDate?.slice(0, 10) ?? null),
              },
              {
                label: "Expected completion",
                value: formatDateOnly(
                  project.expectedCompletionDate?.slice(0, 10) ?? null,
                ),
              },
            ]}
          />
        </article>
        <article className="bg-card rounded-lg border p-4">
          <RecordSectionHeading
            title="Planning & pricing"
            description="Project planning values and default Order markups, not actual costs or revenue."
          />
          <RecordFields
            values={[
              {
                label: "Client budget target HT",
                value: money(project.clientBudgetTargetHt),
              },
              {
                label: "Expected product purchase cost HT",
                value: money(project.estimatedPurchaseCostHt),
              },
              {
                label: "Budgeted freight HT (automatic)",
                value: money(
                  projectFreightBudget(
                    project.estimatedPurchaseCostHt?.toString(),
                    project.freightEstimateRate?.toString(),
                  ),
                ),
              },
              {
                label: "Freight estimate",
                value: formatRate(
                  project.freightEstimateRate?.toString() ?? null,
                ),
              },
              {
                label: "Product markup",
                value: formatRate(project.defaultProductMarkupRate.toString()),
              },
              {
                label: "Freight markup",
                value: formatRate(project.defaultFreightMarkupRate.toString()),
              },
              {
                label: "Other cost markup",
                value: formatRate(
                  project.defaultOtherCostMarkupRate.toString(),
                ),
              },
              ...(project.targetMode === "EXPECTED_SELL"
                ? [
                    {
                      label: "Expected sell HT",
                      value: money(project.expectedSellHt),
                    },
                  ]
                : []),
            ]}
          />
        </article>
      </div>
      <article className="bg-card rounded-lg border p-4">
        <RecordSectionHeading title="Notes" />
        <p className="text-muted-foreground mt-3 text-sm whitespace-pre-wrap">
          {project.notes || "No notes."}
        </p>
        {project.freightEstimateNotes ? (
          <p className="mt-3 border-t pt-3 text-xs whitespace-pre-wrap">
            <span className="font-medium">Freight planning:</span>{" "}
            {project.freightEstimateNotes}
          </p>
        ) : null}
      </article>
    </div>
  );
}
