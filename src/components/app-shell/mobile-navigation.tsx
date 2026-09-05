"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { AppBrand } from "@/components/app-shell/app-brand";
import {
  AccountControl,
  type AccountControlUser,
} from "@/components/app-shell/account-control";
import { NavigationLinks } from "@/components/app-shell/sidebar-navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navigationForRole } from "@/config/navigation";
export function MobileNavigation({
  companyName,
  itemManagementEnabled,
  user,
}: {
  companyName: string;
  itemManagementEnabled: boolean;
  user: AccountControlUser;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-[18rem] p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="sr-only">Application navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate the workspace.
          </SheetDescription>
          <AppBrand companyName={companyName} />
        </SheetHeader>
        <nav
          aria-label="Mobile navigation"
          className="flex-1 space-y-5 overflow-y-auto px-3"
        >
          {navigationForRole(user.role, itemManagementEnabled).map((group) => (
            <div key={group.label}>
              {group.label !== "Workspace" && (
                <p className="text-muted-foreground px-2 pb-2 text-xs">
                  {group.label}
                </p>
              )}
              <NavigationLinks
                group={group}
                onNavigate={() => setOpen(false)}
              />
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <AccountControl user={user} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
