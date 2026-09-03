import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  ListTree,
  Package,
  Settings,
  Truck,
  WalletCards,
} from "lucide-react";

export interface NavigationItem {
  href: string;
  icon: LucideIcon;
  isAvailable: boolean;
  label: string;
  roles?: readonly ("ADMIN" | "MANAGER" | "USER")[];
}

export interface NavigationGroup {
  items: readonly NavigationItem[];
  label: string;
}

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/",
        icon: LayoutDashboard,
        isAvailable: true,
        label: "Dashboard",
      },
      { href: "/orders", icon: Package, isAvailable: true, label: "Orders" },
      {
        href: "/items",
        icon: ListTree,
        isAvailable: true,
        label: "Items (Beta)",
      },
      {
        href: "/billing",
        icon: WalletCards,
        isAvailable: true,
        label: "Payments / Billing",
      },
      {
        href: "/calendar",
        icon: CalendarDays,
        isAvailable: true,
        label: "Calendar",
      },
      {
        href: "/reports",
        icon: BarChart3,
        isAvailable: true,
        label: "Reports",
      },
      {
        href: "/admin/activity",
        icon: History,
        isAvailable: true,
        label: "Activity",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        href: "/settings",
        icon: Settings,
        isAvailable: true,
        label: "Settings",
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    label: "Directory",
    items: [
      {
        href: "/projects",
        icon: FolderKanban,
        isAvailable: true,
        label: "Projects",
      },
      {
        href: "/clients",
        icon: Building2,
        isAvailable: true,
        label: "Clients",
      },
      {
        href: "/suppliers",
        icon: Truck,
        isAvailable: true,
        label: "Suppliers",
      },
    ],
  },
  {
    label: "Reserved",
    items: [
      {
        href: "/documents",
        icon: FileText,
        isAvailable: false,
        label: "Documents",
      },
    ],
  },
];

export function navigationForRole(
  role: "ADMIN" | "MANAGER" | "USER",
  itemManagementEnabled = false,
): readonly NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.roles || item.roles.includes(role)) &&
          (item.href !== "/items" || itemManagementEnabled),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
