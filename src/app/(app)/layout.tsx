import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default function ApplicationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProtectedApplicationLayout>{children}</ProtectedApplicationLayout>;
}

async function ProtectedApplicationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
