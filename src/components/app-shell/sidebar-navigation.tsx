import Link from "next/link";

import { AppBrand } from "@/components/app-shell/app-brand";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navigationForRole } from "@/config/navigation";

export function SidebarNavigation({
  companyName,
  role,
}: {
  companyName: string;
  role: "ADMIN" | "MANAGER" | "USER";
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-4">
        <AppBrand companyName={companyName} />
      </div>

      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-5 px-3 py-3"
      >
        {navigationForRole(role).map((group) => (
          <div key={group.label}>
            <p className="text-muted-foreground mb-1.5 px-2 text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.label}>
                    {item.isAvailable ? (
                      <Link
                        href={item.href}
                        aria-current="page"
                        className="bg-sidebar-accent text-sidebar-accent-foreground flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-disabled="true"
                            className="text-muted-foreground flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm"
                          >
                            <Icon aria-hidden="true" className="size-4" />
                            <span>{item.label}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          Planned for a later phase
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border border-t p-3">
        <div className="flex items-center justify-between rounded-md px-2 py-1.5">
          <div>
            <p className="text-xs font-medium">Internal workspace</p>
            <p className="text-muted-foreground text-[0.6875rem]">
              Procurement operations
            </p>
          </div>
          <Badge
            variant="outline"
            className="h-5 px-1.5 font-mono text-[0.625rem]"
          >
            ERP
          </Badge>
        </div>
      </div>
    </div>
  );
}
