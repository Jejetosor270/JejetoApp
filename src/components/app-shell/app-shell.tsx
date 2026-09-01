import type { ReactNode } from "react";

import { SidebarNavigation } from "@/components/app-shell/sidebar-navigation";
import { TopBar } from "@/components/app-shell/top-bar";
import type { AccountControlUser } from "@/components/app-shell/account-control";

export function AppShell({
  children,
  companyName,
  itemManagementEnabled,
  user,
}: {
  children: ReactNode;
  companyName: string;
  itemManagementEnabled: boolean;
  user: AccountControlUser;
}) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <aside className="border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 border-r lg:block">
        <SidebarNavigation
          companyName={companyName}
          itemManagementEnabled={itemManagementEnabled}
          role={user.role}
        />
      </aside>
      <div className="flex min-h-svh min-w-0 flex-col lg:col-start-2">
        <TopBar
          companyName={companyName}
          itemManagementEnabled={itemManagementEnabled}
          user={user}
        />
        <main
          id="main-content"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-[90rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
