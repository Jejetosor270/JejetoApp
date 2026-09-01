import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth/current-user";
import { getApplicationSettings } from "@/lib/settings/application-settings";

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
  const [user, settings] = await Promise.all([
    requireUser(),
    getApplicationSettings(),
  ]);

  return (
    <AppShell
      companyName={settings.companyName}
      itemManagementEnabled={settings.itemManagementEnabled}
      user={user}
    >
      {children}
    </AppShell>
  );
}
