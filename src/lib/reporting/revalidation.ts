import "server-only";

import { revalidatePath } from "next/cache";

/** Refreshes the views derived from Project financial records after a write. */
export function revalidateProjectFinancialViews(projectId?: string): void {
  revalidatePath("/settings/trash");
  revalidatePath("/payments/[paymentId]", "page");
  revalidatePath("/receipts", "layout");
  revalidatePath("/installments", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  else revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/orders");
  revalidatePath("/orders/[orderId]", "page");
  revalidatePath("/reports");
  revalidatePath("/");
}
