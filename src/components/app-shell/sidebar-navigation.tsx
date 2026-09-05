"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { AppBrand } from "@/components/app-shell/app-brand";
import {
  AccountControl,
  type AccountControlUser,
} from "@/components/app-shell/account-control";
import { Button } from "@/components/ui/button";
import {
  isNavigationActive,
  navigationForRole,
  type NavigationGroup,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

export function NavigationLinks({
  group,
  collapsed = false,
  onNavigate,
}: {
  group: NavigationGroup;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {group.items.map((item) => {
        const Icon = item.icon;
        const active = isNavigationActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => onNavigate?.()}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
export function SidebarNavigation({
  companyName,
  itemManagementEnabled,
  user,
  collapsed,
  onToggle,
}: {
  companyName: string;
  itemManagementEnabled: boolean;
  user: AccountControlUser;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const groups = navigationForRole(user.role, itemManagementEnabled);
  return (
    <div className="flex h-full flex-col gap-5 px-2 py-4">
      <div className={cn("flex min-h-9 items-center", !collapsed && "px-2")}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <AppBrand companyName={companyName} />
          </div>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          className={collapsed ? "mx-auto" : "shrink-0"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      {collapsed ? (
        <Link
          href="/search"
          aria-label="Search records"
          title="Search records"
          className="text-muted-foreground mx-auto rounded-md p-2"
        >
          <Search className="size-[18px]" />
        </Link>
      ) : (
        <form action="/search" className="relative mx-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
          />
          <input
            name="q"
            type="search"
            aria-label="Search records"
            placeholder="Search records…"
            className="bg-background h-9 w-full rounded-md border pr-2 pl-8 text-[13px]"
          />
        </form>
      )}
      <nav
        aria-label="Primary navigation"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto"
      >
        {groups
          .filter((group) => group.label !== "Administration")
          .map((group) =>
            group.label === "More" && !collapsed ? (
              <details
                key={group.label + pathname}
                open={
                  group.items.some((item) =>
                    isNavigationActive(pathname, item.href),
                  ) || undefined
                }
                className="group"
              >
                <summary className="text-muted-foreground mb-1 flex cursor-pointer list-none items-center justify-between rounded-md px-2.5 py-2 text-xs">
                  More
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <NavigationLinks group={group} />
              </details>
            ) : (
              <NavigationLinks
                key={group.label}
                group={group}
                collapsed={collapsed}
              />
            ),
          )}
      </nav>
      <div className="space-y-3 border-t pt-3">
        {groups
          .filter((group) => group.label === "Administration")
          .map((group) => (
            <NavigationLinks
              key={group.label}
              group={group}
              collapsed={collapsed}
            />
          ))}
        <AccountControl user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}
