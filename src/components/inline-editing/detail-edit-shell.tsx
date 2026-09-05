"use client";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
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
  return (
    <div className="relative space-y-6">
      {canEdit ? (
        <div className="float-right ml-4">
          <EditorDrawer
            title={label}
            wide
            trigger={
              <Button variant="outline" type="button">
                <Pencil data-icon="inline-start" />
                {label}
              </Button>
            }
          >
            {editor}
            <SheetClose asChild>
              <Button className="mt-3" type="button" variant="outline">
                Cancel editing
              </Button>
            </SheetClose>
          </EditorDrawer>
        </div>
      ) : null}
      {children}
    </div>
  );
}
