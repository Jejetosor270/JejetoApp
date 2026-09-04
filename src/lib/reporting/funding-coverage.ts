import "server-only";

import {
  calculateProjectFundingCoverage,
  type ProjectFundingCoverage,
} from "@/domain/billing/funding-coverage";
import { getProjectsClientBillingSummaries } from "@/lib/billing/reporting";
import { listOrderFundingRows } from "@/lib/procurement/orders";

export async function getProjectsFundingCoverage(
  projects: readonly { id: string; reportingCurrencyCode: string }[],
): Promise<Map<string, ProjectFundingCoverage>> {
  if (projects.length === 0) return new Map();
  const projectIds = projects.map((project) => project.id);
  const [billingByProject, orders] = await Promise.all([
    getProjectsClientBillingSummaries(projects),
    listOrderFundingRows(projectIds),
  ]);

  return new Map(
    projects.map((project) => {
      const billing = billingByProject.get(project.id);
      return [
        project.id,
        calculateProjectFundingCoverage({
          clientBillingCoverageComplete: billing?.coverageComplete ?? false,
          clientBillingCoverageHt: billing?.coverageHt ?? "0",
          supplierOrders: orders
            .filter((order) => order.projectId === project.id)
            .map((order) => ({
              id: order.id,
              sellingHt: order.sellingHt,
              status: order.status,
            })),
        }),
      ];
    }),
  );
}
