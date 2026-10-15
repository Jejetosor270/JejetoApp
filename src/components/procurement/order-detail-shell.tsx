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
  recordDelivery = false,
}: {
  canEdit: boolean;
  children: ReactNode;
  options: OrderFormOptions;
  order: EditableOrder;
  startEditing?: boolean;
  recordDelivery?: boolean;
}) {
  const [editing, setEditing] = useState(canEdit && startEditing);
  const [proposeDelivery, setProposeDelivery] = useState(recordDelivery);
  return (
    <div className="relative space-y-6">
      {canEdit ? (
        <Button
          className="float-right mt-4 mr-4 ml-4 sm:mt-5 sm:mr-5"
          onClick={() => {
            setProposeDelivery(false);
            setEditing(true);
          }}
          type="button"
          variant="outline"
        >
          <Pencil data-icon="inline-start" /> Edit order
        </Button>
      ) : null}
      {children}
      {canEdit && editing ? (
        <EditorDrawer
          open
          wide
          title="Edit Order"
          onOpenChange={(open) => {
            setEditing(open);
            if (!open) setProposeDelivery(false);
          }}
        >
          <OrderForm
            onSaved={() => {
              setEditing(false);
              setProposeDelivery(false);
            }}
            options={options}
            order={order}
            recordDelivery={proposeDelivery}
          />
        </EditorDrawer>
      ) : null}
    </div>
  );
}
