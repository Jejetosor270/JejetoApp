import { projectRead } from "@/lib/reporting/project-diagnostics";
import { getRecordHistory } from "@/lib/audit/history";
import { RecordHistory } from "@/components/audit/record-history";
import { editVersion, editFieldVersions } from "@/lib/edit-version";
import { projectBudgetSnapshot } from "@/lib/master-data/project-budget";
import { projectFreightBudget } from "@/domain/freight/calculations";
import { ProjectPaymentTerms } from "@/components/payments/project-payment-terms";
import { getProjectControl } from "@/lib/reporting/project-control";
import { ProjectFreightPayments } from "@/components/freight/project-freight-payments";
import { getApplicationSettings } from "@/lib/settings/application-settings";
import { RelatedItems } from "@/components/items/related-items";
import { RelatedRecords } from "@/components/layout/related-records";
import { getProjectRelations } from "@/lib/related-records/records";
import { ProjectPurchaseBudget } from "@/components/procurement/project-purchase-budget";
import { optionalUuid } from "@/domain/listing/validation";
import { ProjectPackages } from "@/components/procurement/project-packages";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { ProjectFinancialOverview } from "@/components/reporting/project-financial-overview";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";
import { ProjectFreightExpenses } from "@/components/freight/project-freight-expenses";
import { listProjectFreightExpenses } from "@/lib/freight/expenses";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ horizon?: string; tab?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  if (!optionalUuid(projectId)) notFound();
  const destinations: Record<string, string> = {
    orders: "/orders",
    billing: "/billing",
    cash: "/reports",
    items: "/items",
  };
  const legacyDestination = Object.hasOwn(destinations, query.tab ?? "")
    ? destinations[query.tab ?? ""]
    : undefined;
  if (legacyDestination) {
    await requireUser();
    const destinationQuery = new URLSearchParams({ projectId });
    if (query.tab === "cash") {
      destinationQuery.set("view", "cash-flow");
      if (query.horizon) destinationQuery.set("horizon", query.horizon);
    }
    redirect(legacyDestination + "?" + destinationQuery);
  }
  const user = await requireUser();
  const result = await projectRead("record", () => getProject(projectId));
  if (!result) notFound();
  const [options, freightExpenses, relations, control, settings, history] =
    await Promise.all([
      listProjectFormOptions(),
      projectRead("freight expenses", () =>
        listProjectFreightExpenses(projectId),
      ),
      projectRead("relations", () =>
        getProjectRelations(projectId, { includeCash: false }),
      ),
      projectRead("financials", () => getProjectControl(projectId)),
      getApplicationSettings(),
      projectRead("history", () => getRecordHistory("PROJECT", projectId)),
    ]);
  const { buildings, project } = result;
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      workspace={{
        history: history ? <RecordHistory history={history} /> : null,
        related: (
          <RelatedRecords
            tables={relations.filter((table) => table.id === "billing")}
          />
        ),
        purchasing: (
          <RelatedRecords
            tables={relations.filter((table) => table.id === "orders")}
          />
        ),
        client: (
          <RelatedRecords
            tables={relations.filter((table) => table.id === "clients")}
          />
        ),
        payments: (
          <ProjectPaymentTerms
            projectId={project.id}
            canEdit={canEditMasterData(user.role)}
          />
        ),
        overview: (
          <ProjectFinancialOverview
            data={{ currency: control.currency, dashboard: control.dashboard }}
            projectId={projectId}
          />
        ),
        freightExpenses: (
          <div className="space-y-5">
            <ProjectFreightExpenses
              canEdit={canEditMasterData(user.role)}
              currencies={options.currencies}
              expenses={freightExpenses}
              projectId={projectId}
              reportingCurrencyCode={project.reportingCurrencyCode}
              suppliers={options.suppliers}
            />
            <ProjectFreightPayments
              projectId={projectId}
              canEdit={canEditMasterData(user.role)}
            />
          </div>
        ),
        budget: (
          <details className="record-surface">
            <summary className="cursor-pointer text-sm font-semibold">
              Purchase budget allocation
            </summary>
            <div className="mt-4">
              <ProjectPurchaseBudget projectId={projectId} />
            </div>
          </details>
        ),
        packages: (
          <ProjectPackages
            projectId={projectId}
            currency={project.reportingCurrencyCode}
            canEdit={canEditMasterData(user.role)}
          />
        ),
        items: settings.itemManagementEnabled ? (
          <RelatedItems projectId={projectId} />
        ) : null,
      }}
      managers={options.managers}
      project={{
        ...project,
        budgetEditVersion: editVersion(projectBudgetSnapshot(project)),
        budgetEditFields: editFieldVersions(projectBudgetSnapshot(project)),
        estimatedOtherCostHt: project.estimatedOtherCostHt?.toString() ?? null,
        clientId: project.clientId ?? "",
        client: project.client ?? { id: "", displayName: "Unassigned" },
        clientBudgetTargetHt: project.clientBudgetTargetHt?.toString() ?? null,
        defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
        defaultOtherCostMarkupRate:
          project.defaultOtherCostMarkupRate.toString(),
        defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
        estimatedFreightCostHt: projectFreightBudget(
          project.estimatedPurchaseCostHt?.toString(),
          project.freightEstimateRate?.toString(),
        ),
        estimatedPurchaseCostHt:
          project.estimatedPurchaseCostHt?.toString() ?? null,
        expectedSellHt: project.expectedSellHt?.toString() ?? null,
        startDate: project.startDate?.toISOString() ?? null,
        targetMarkupRate: project.targetMarkupRate?.toString() ?? null,
      }}
      statuses={options.statuses}
    />
  );
}
