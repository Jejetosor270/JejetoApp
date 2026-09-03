import "server-only";

import { revalidatePath } from "next/cache";

/** Refreshes the views derived from Project financial records after a write. */
export function revalidateProjectFinancialViews(projectId?: string): void {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  else revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/reports");
  revalidatePath("/");
}
