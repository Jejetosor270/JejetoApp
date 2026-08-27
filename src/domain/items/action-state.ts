import type { BudgetField, BudgetReviewRow } from "@/domain/items/import";

export interface ItemActionState {
  itemId?: string;
  message: string;
  status: "idle" | "error" | "success";
}

export interface BudgetImportActionState {
  message?: string;
  review?: {
    defaultBuildingId: string | null;
    defaultSupplierId: string | null;
    detectedTotal: string | null;
    extractionModel: string | null;
    extractionProvider: string | null;
    filename: string;
    mapping: Record<string, BudgetField>;
    projectId: string;
    rows: BudgetReviewRow[];
    sheets: string[];
    summary: {
      conflicts: number;
      creates: number;
      detected: number;
      updates: number;
      warnings: number;
    };
  };
  status?: "error" | "ready" | "success";
}
