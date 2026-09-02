"use client";

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
}: {
  canEdit: boolean;
  children: ReactNode;
  options: OrderFormOptions;
  order: EditableOrder;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <OrderForm
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
        options={options}
        order={order}
      />
    );
  }
  return (
    <div className="relative space-y-6">
      {canEdit ? (
        <Button
          className="absolute top-4 right-4 z-10"
          onClick={() => setEditing(true)}
          type="button"
          variant="outline"
        >
          <Pencil data-icon="inline-start" /> Edit order
        </Button>
      ) : null}
      {children}
    </div>
  );
}
