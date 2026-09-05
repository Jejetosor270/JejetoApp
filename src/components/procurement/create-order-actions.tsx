"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { EditorDrawer } from "@/components/forms/editor-drawer";

export function CreateOrderActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const itemClass =
    "cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted";
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button>
            New Supplier Order{" "}
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground z-50 min-w-56 rounded-md border p-1 shadow-md"
          >
            <DropdownMenu.Item asChild className={itemClass}>
              <Link href="/orders/import">Import Supplier document</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => setOpen(true)}
            >
              Enter manually
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <EditorDrawer
        title="New Supplier Order"
        wide
        open={open}
        onOpenChange={setOpen}
      >
        {children}
      </EditorDrawer>
    </>
  );
}
