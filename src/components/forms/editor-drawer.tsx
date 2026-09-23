"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DraftGuard, hasUnsavedDrafts } from "@/components/forms/draft-guard";
import { cn } from "@/lib/utils";

export function EditorDrawer({
  children,
  title,
  description = "Review your changes before saving.",
  trigger,
  wide = false,
  size = "standard",
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  trigger?: ReactNode;
  wide?: boolean;
  size?: "compact" | "standard" | "wide";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [discard, setDiscard] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  function changeOpen(next: boolean) {
    if (!next && content.current && hasUnsavedDrafts(content.current)) {
      setDiscard(true);
      return;
    }
    setOpen(next);
  }
  return (
    <>
      <Sheet open={open} onOpenChange={changeOpen}>
        {controlledOpen === undefined && (
          <SheetTrigger asChild>
            {trigger ?? (
              <Button variant="outline" type="button">
                {title}
              </Button>
            )}
          </SheetTrigger>
        )}
        <SheetContent
          ref={content}
          showCloseButton={false}
          className={cn(
            "gap-0 data-[side=right]:w-full",
            wide || size === "wide"
              ? "data-[side=right]:sm:max-w-[calc(100vw-3rem)]"
              : size === "compact"
                ? "data-[side=right]:sm:max-w-md"
                : "data-[side=right]:sm:max-w-2xl",
          )}
        >
          <SheetHeader className="shrink-0 border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="min-w-0 break-words">{title}</SheetTitle>
              <Button
                variant="ghost"
                type="button"
                onClick={() => changeOpen(false)}
              >
                Close
              </Button>
            </div>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="@container min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            <DraftGuard>{children}</DraftGuard>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes have not been saved. Keep editing to preserve this
              draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Keep editing</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  setDiscard(false);
                  setOpen(false);
                }}
              >
                Discard changes
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Keep inside the owning form so native submission and validation are unchanged. */
export function EditorActions({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t py-3">
      {children}
    </div>
  );
}
