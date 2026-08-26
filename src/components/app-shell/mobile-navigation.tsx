"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

import { AppBrand } from "@/components/app-shell/app-brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navigationForRole } from "@/config/navigation";

export function MobileNavigation({
  companyName,
  role,
}: {
  companyName: string;
  role: "ADMIN" | "MANAGER" | "USER";
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-[18rem] p-0">
        <SheetHeader className="border-sidebar-border border-b px-4 py-4 text-left">
          <SheetTitle className="sr-only">Application navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate the MB Procurement workspace.
          </SheetDescription>
          <AppBrand companyName={companyName} />
        </SheetHeader>

        <nav aria-label="Mobile navigation" className="space-y-5 px-3 py-4">
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
                        <SheetClose asChild>
                          <Link
                            href={item.href}
                            aria-current="page"
                            className="bg-sidebar-accent text-sidebar-accent-foreground flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium"
                          >
                            <Icon aria-hidden="true" className="size-4" />
                            {item.label}
                          </Link>
                        </SheetClose>
                      ) : (
                        <span
                          aria-disabled="true"
                          className="text-muted-foreground flex h-9 items-center gap-2.5 px-2.5 text-sm"
                        >
                          <Icon aria-hidden="true" className="size-4" />
                          {item.label}
                          <span className="ms-auto text-[0.625rem] tracking-wide uppercase">
                            Later
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
