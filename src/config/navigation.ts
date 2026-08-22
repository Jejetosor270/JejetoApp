import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
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
        isAvailable: false,
        label: "Payments",
      },
      {
        href: "/calendar",
        icon: CalendarDays,
        isAvailable: false,
        label: "Calendar",
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
      {
        href: "/reports",
        icon: BarChart3,
        isAvailable: false,
        label: "Reports",
      },
      {
        href: "/settings",
        icon: Settings,
        isAvailable: false,
        label: "Settings",
      },
    ],
  },
];
