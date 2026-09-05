"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function ConfirmSubmit({
  title,
  description,
  label = "Delete",
  disabled = false,
}: {
  title: string;
  description: string;
  label?: string;
  disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          ref={trigger}
          disabled={disabled}
          size="sm"
          variant="destructive"
          type="button"
        >
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={() => trigger.current?.form?.requestSubmit()}
            >
              {label}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
