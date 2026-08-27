import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createItemAction } from "@/app/(app)/items/actions";
import { ItemForm } from "@/components/items/item-form";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listItemOptions } from "@/lib/items/items";

export const metadata: Metadata = { title: "Create Item" };

export default async function NewItemPage() {
  const [user, options] = await Promise.all([requireUser(), listItemOptions()]);
  if (!canEditMasterData(user.role)) redirect("/items");
  return (
    <div className="space-y-5">
      <header>
        <p className="text-primary text-xs font-medium uppercase">Items</p>
        <h1 className="mt-2 text-2xl font-semibold">Create Item</h1>
      </header>
      <ItemForm action={createItemAction} options={options} />
    </div>
  );
}
