import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";
import { listProjectOrders } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [user, options, result, orders] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
    listProjectOrders(projectId),
  ]);
  if (!result) notFound();
  const { buildings, project } = result;
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      managers={options.managers}
      orders={orders.map((order) => {
        const committed = order.financialStates.find(
          (state) => state.state === "COMMITTED",
        );
        return {
          committedLandedCost: committed?.landedCost ?? null,
          grossMarginRate: committed?.grossMarginRate ?? null,
          id: order.id,
          orderCurrencyCode: order.orderCurrencyCode,
          orderNumber: order.orderNumber,
          packageName: order.packageName,
          sellingCurrencyCode: order.sellingCurrencyCode,
          status: order.status,
          supplierName: order.supplier.displayName,
          totalSellingRevenue: order.totalSellingRevenue,
        };
      })}
      project={{
        ...project,
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        startDate: project.startDate?.toISOString() ?? null,
      }}
      statuses={options.statuses}
    />
  );
}
