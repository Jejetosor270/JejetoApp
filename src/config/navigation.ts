import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FolderKanban,
  House,
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
      { href: "/", icon: House, isAvailable: true, label: "Home" },
      {
        href: "/projects",
        icon: FolderKanban,
        isAvailable: true,
        label: "Projects",
      },
      {
        href: "/orders",
        icon: Package,
        isAvailable: true,
        label: "Purchasing",
      },
      {
        href: "/billing",
        icon: WalletCards,
        isAvailable: true,
        label: "Billing",
      },
      {
        href: "/reports",
        icon: BarChart3,
        isAvailable: true,
        label: "Reports",
      },
    ],
  },
  {
    label: "More",
    items: [
      {
        href: "/payments",
        icon: CircleDollarSign,
        isAvailable: true,
        label: "Payments",
      },
      {
        href: "/installments",
        icon: CalendarDays,
        isAvailable: true,
        label: "Installments",
      },
      {
        href: "/receipts",
        icon: WalletCards,
        isAvailable: true,
        label: "Receipts",
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
      {
        href: "/calendar",
        icon: CalendarDays,
        isAvailable: true,
        label: "Calendar",
      },
      {
        href: "/items",
        icon: ListTree,
        isAvailable: true,
        label: "Items (Beta)",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/settings",
        icon: Settings,
        isAvailable: true,
        label: "Settings",
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
];
/** Match segments so Home and similarly named routes never light up together. */
export function isNavigationActive(pathname: string, href: string): boolean {
  if (href === "/settings" && pathname.startsWith("/admin/")) return true;
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}
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
