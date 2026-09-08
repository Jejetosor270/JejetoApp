import "server-only";
import { getDatabase } from "@/lib/db";
import { projectPurchaseBudget } from "@/domain/finance/order-budget";
export async function getProjectPurchaseBudget(projectId: string) {
  const project = await getDatabase().project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      estimatedPurchaseCostHt: true,
      reportingCurrencyCode: true,
      orders: {
        where: { status: { not: "CANCELLED" } },
        select: { budgetPurchaseAmountHt: true },
      },
    },
  });
  return {
    ...projectPurchaseBudget(
      project.estimatedPurchaseCostHt?.toString() ?? null,
      project.orders.map(
        (order) => order.budgetPurchaseAmountHt?.toString() ?? null,
      ),
    ),
    currency: project.reportingCurrencyCode,
  };
}
