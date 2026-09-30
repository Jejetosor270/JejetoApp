"use client";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
export const ProjectBudgetContext = createContext<(() => void) | null>(null);
export function EditProjectBudgetButton() {
  const open = useContext(ProjectBudgetContext);
  return open ? (
    <Button type="button" size="sm" variant="outline" onClick={open}>
      Edit budget & pricing
    </Button>
  ) : null;
}
