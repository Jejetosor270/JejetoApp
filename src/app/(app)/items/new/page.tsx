import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createItemAction } from "@/app/(app)/items/actions";
import { ItemForm } from "@/components/items/item-form";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listItemOptions } from "@/lib/items/items";
import { isItemManagementEnabled } from "@/lib/settings/application-settings";

export const metadata: Metadata = { title: "Create Item" };

export default async function NewItemPage() {
  if (!(await isItemManagementEnabled())) notFound();
  const [user, options] = await Promise.all([requireUser(), listItemOptions()]);
  if (!canEditMasterData(user.role)) redirect("/items");
  return (
    <div className="space-y-5">
      <PageHeader title="Create Item" />
      <ItemForm action={createItemAction} options={options} />
    </div>
  );
}
