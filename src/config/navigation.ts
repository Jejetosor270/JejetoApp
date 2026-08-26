import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
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
      {
        href: "/projects",
        icon: FolderKanban,
        isAvailable: true,
        label: "Projects",
      },
      { href: "/orders", icon: Package, isAvailable: true, label: "Orders" },
      {
        href: "/payments",
        icon: WalletCards,
        isAvailable: true,
        label: "Payments",
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
        href: "/suppliers",
        icon: Truck,
        isAvailable: true,
        label: "Suppliers",
      },
      {
        href: "/clients",
        icon: Building2,
        isAvailable: true,
        label: "Clients",
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
): readonly NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || item.roles.includes(role),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
