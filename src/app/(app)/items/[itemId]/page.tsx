import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateItemAction } from "@/app/(app)/items/actions";
import { ItemForm } from "@/components/items/item-form";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getItem, listItemOptions } from "@/lib/items/items";

export const metadata: Metadata = { title: "Item detail" };

export default async function ItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const [user, item, options] = await Promise.all([
    requireUser(),
    getItem(itemId),
    listItemOptions(),
  ]);
  if (!item) notFound();
  const currency = item.purchaseCurrencyCode ?? "—";
  return (
    <div className="space-y-5">
      <header>
        <p className="text-primary text-xs font-medium uppercase">
          Item detail
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {item.itemReference ? `${item.itemReference} · ` : ""}
          {item.name}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {item.project.name}
          {item.building ? ` · ${item.building.name}` : " · Unallocated"}
          {item.room ? ` · ${item.room.name}` : ""}
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Purchase HT", formatMoney(item.totalPurchasePriceHt, currency)],
          ["Selling HT", formatMoney(item.totalSellingPriceHt, currency)],
          ["Gross profit", formatMoney(item.financial.grossProfit, currency)],
          ["Margin", formatRate(item.financial.grossMarginRate)],
        ].map(([label, value]) => (
          <div className="rounded-lg border p-3" key={label}>
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="financial-figure mt-1 font-semibold">{value}</p>
          </div>
        ))}
      </section>
      {item.financial.warnings.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {item.financial.warnings.join(" ")}
        </div>
      ) : null}
      {canEditMasterData(user.role) ? (
        <ItemForm action={updateItemAction} item={item} options={options} />
      ) : (
        <p className="text-muted-foreground text-sm">Read-only access.</p>
      )}
      <footer className="text-muted-foreground text-xs">
        Source: {item.sourceType.replaceAll("_", " ")}
        {item.itemImport ? ` · ${item.itemImport.originalFilename}` : ""} ·
        Created by {item.createdBy?.name ?? "deleted employee"} · Updated by{" "}
        {item.updatedBy?.name ?? "deleted employee"}
      </footer>
    </div>
  );
}
