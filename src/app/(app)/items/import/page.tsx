import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BudgetImport } from "@/components/items/budget-import";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listItemOptions } from "@/lib/items/items";
import { isItemManagementEnabled } from "@/lib/settings/application-settings";

export const metadata: Metadata = { title: "Import Project budget" };
export const maxDuration = 120;

export default async function BudgetImportPage() {
  if (!(await isItemManagementEnabled())) notFound();
  const [user, options] = await Promise.all([requireUser(), listItemOptions()]);
  if (!canEditMasterData(user.role)) redirect("/items");
  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Project budget"
        description={
          <>
            Parse, match, review, and explicitly confirm up to 500 XLSX lines.
          </>
        }
      />
      <BudgetImport options={options} />
    </div>
  );
}
