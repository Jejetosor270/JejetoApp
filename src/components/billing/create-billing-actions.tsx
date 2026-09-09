"use client";

import { useState, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import {
  ClientDocumentIntake,
  ClientDocumentReview,
} from "./client-document-intake";
import { manualBillingReview } from "@/domain/billing/manual-review";

export function CreateBillingActions({
  options,
}: ComponentProps<typeof ClientDocumentIntake>) {
  const [mode, setMode] = useState<"import" | "manual" | null>(null);
  const itemClass =
    "cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted";
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button>
            New Billing <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground z-50 min-w-56 rounded-md border p-1 shadow-md"
          >
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => setMode("import")}
            >
              Import Client document
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => setMode("manual")}
            >
              Enter manually
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {mode && (
        <EditorDrawer
          title={mode === "manual" ? "New Billing" : "Import Client Document"}
          wide
          open
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
        >
          {mode === "manual" ? (
            <ClientDocumentReview
              options={options}
              review={manualBillingReview()}
            />
          ) : (
            <ClientDocumentIntake options={options} />
          )}
        </EditorDrawer>
      )}
    </>
  );
}
