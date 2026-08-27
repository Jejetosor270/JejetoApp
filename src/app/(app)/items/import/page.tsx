import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BudgetImport } from "@/components/items/budget-import";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listItemOptions } from "@/lib/items/items";

export const metadata: Metadata = { title: "Import Project budget" };
export const maxDuration = 120;

export default async function BudgetImportPage() {
  const [user, options] = await Promise.all([requireUser(), listItemOptions()]);
  if (!canEditMasterData(user.role)) redirect("/items");
  return (
    <div className="space-y-5">
      <header>
        <p className="text-primary text-xs font-medium uppercase">Items</p>
        <h1 className="mt-2 text-2xl font-semibold">Import Project budget</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Parse, match, review, and explicitly confirm up to 500 XLSX lines.
        </p>
      </header>
      <BudgetImport options={options} />
    </div>
  );
}
