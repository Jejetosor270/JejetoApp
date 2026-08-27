import type { BudgetField, BudgetReviewRow } from "@/domain/items/import";

export interface ItemActionState {
  itemId?: string;
  message: string;
  status: "idle" | "error" | "success";
}

export interface BudgetImportActionState {
  message?: string;
  review?: {
    ambiguousHeaders: string[];
    conflicts: Array<{ field: BudgetField; headers: string[] }>;
    defaultBuildingId: string | null;
    defaultSupplierId: string | null;
    detectedTotal: string | null;
    extractionModel: string | null;
    extractionProvider: string | null;
    filename: string;
    ignoredHeaderCount: number;
    mapping: Record<string, BudgetField>;
    mappingLevels: Record<string, "EXACT" | "KNOWN" | "STRUCTURAL" | "AI">;
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
    unmappedHeaders: string[];
  };
  status?: "error" | "ready" | "success";
}
