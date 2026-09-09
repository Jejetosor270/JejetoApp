"use client";

import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  OrderForm,
  type EditableOrder,
  type OrderFormOptions,
} from "@/components/procurement/order-form";
import { Button } from "@/components/ui/button";

export function OrderDetailShell({
  canEdit,
  children,
  options,
  order,
  startEditing = false,
}: {
  canEdit: boolean;
  children: ReactNode;
  options: OrderFormOptions;
  order: EditableOrder;
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(canEdit && startEditing);
  return (
    <div className="relative space-y-6">
      {canEdit ? (
        <Button
          className="float-right ml-4"
          onClick={() => setEditing(true)}
          type="button"
          variant="outline"
        >
          <Pencil data-icon="inline-start" /> Edit order
        </Button>
      ) : null}
      {children}
      {canEdit && editing ? (
        <EditorDrawer open wide title="Edit Order" onOpenChange={setEditing}>
          <OrderForm
            onSaved={() => setEditing(false)}
            options={options}
            order={order}
          />
        </EditorDrawer>
      ) : null}
    </div>
  );
}
