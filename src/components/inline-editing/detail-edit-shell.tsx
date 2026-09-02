"use client";

import { Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";

export function DetailEditShell({
  canEdit,
  children,
  editor,
  label,
}: {
  canEdit: boolean;
  children: ReactNode;
  editor: ReactNode;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div>
        {editor}
        <Button
          className="mt-3"
          onClick={() => setEditing(false)}
          type="button"
          variant="outline"
        >
          Cancel editing
        </Button>
      </div>
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
          <Pencil data-icon="inline-start" />
          {label}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
