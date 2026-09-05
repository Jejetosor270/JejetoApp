"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { SidebarNavigation } from "@/components/app-shell/sidebar-navigation";
import { TopBar } from "@/components/app-shell/top-bar";
import type { AccountControlUser } from "@/components/app-shell/account-control";
import { ReturnNavigation } from "@/components/layout/return-navigation";
import { DraftGuard } from "@/components/forms/draft-guard";

const preferenceKey = "mb-navigation-collapsed";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("navigation-preference", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("navigation-preference", callback);
  };
}
function readPreference() {
  try {
    return localStorage.getItem(preferenceKey) === "true";
  } catch {
    return false;
  }
}

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
  const collapsed = useSyncExternalStore(
    subscribe,
    readPreference,
    () => false,
  );
  const toggleNavigation = () => {
    try {
      localStorage.setItem(preferenceKey, String(!collapsed));
    } catch {
      return;
    }
    window.dispatchEvent(new Event("navigation-preference"));
  };
  return (
    <ReturnNavigation>
      <div
        className={`min-h-svh lg:grid ${collapsed ? "lg:grid-cols-[60px_minmax(0,1fr)]" : "lg:grid-cols-[224px_minmax(0,1fr)]"}`}
      >
        <a
          href="#main-content"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to main content
        </a>
        <aside
          className={`border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-40 hidden border-r lg:block ${collapsed ? "w-[60px]" : "w-56"}`}
        >
          <SidebarNavigation
            companyName={companyName}
            itemManagementEnabled={itemManagementEnabled}
            user={user}
            collapsed={collapsed}
            onToggle={toggleNavigation}
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
            className="flex-1 px-4 py-6 md:px-6 xl:px-8 xl:py-8"
          >
            <div className="mx-auto w-full max-w-[90rem]">
              <DraftGuard>{children}</DraftGuard>
            </div>
          </main>
        </div>
      </div>
    </ReturnNavigation>
  );
}
