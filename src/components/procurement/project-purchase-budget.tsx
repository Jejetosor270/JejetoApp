import { getProjectPurchaseBudget } from "@/lib/procurement/order-budget";
import { formatMoney } from "@/domain/procurement/presentation";
export async function ProjectPurchaseBudget({
  projectId,
}: {
  projectId: string;
}) {
  const budget = await getProjectPurchaseBudget(projectId);
  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Project product purchase budget</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        {[
          ["Project budget HT", budget.target],
          ["Allocated to Orders HT", budget.allocated],
          ["Remaining to allocate HT", budget.remaining],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm">
              {formatMoney(value ?? null, budget.currency)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        {budget.unbudgetedCount} Orders without a budget. Cancelled Orders are
        excluded. A negative remaining amount means the Project budget is
        overallocated.
      </p>
    </section>
  );
}
