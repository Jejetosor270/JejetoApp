import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  AccountControl,
  type AccountControlUser,
} from "@/components/app-shell/account-control";
import { MobileNavigation } from "@/components/app-shell/mobile-navigation";

export function TopBar({
  companyName,
  user,
}: {
  companyName: string;
  user: AccountControlUser;
}) {
  return (
    <header className="bg-background/95 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavigation companyName={companyName} role={user.role} />
        <div className="hidden items-center gap-2 text-sm sm:flex">
          <span className="font-medium">Workspace</span>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <span className="text-muted-foreground">Procurement finance</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <form action="/search" className="relative hidden md:block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            aria-label="Global search"
            className="border-input bg-background h-8 w-52 rounded-md border pr-3 pl-8 text-xs outline-none focus-visible:ring-2"
            name="q"
            placeholder="Search records…"
          />
        </form>
        <Badge
          variant="outline"
          className="border-positive/25 bg-positive-muted text-positive hidden sm:inline-flex"
        >
          Operational
        </Badge>
        <div
          className="bg-border hidden h-5 w-px sm:block"
          aria-hidden="true"
        />
        <AccountControl user={user} />
      </div>
    </header>
  );
}
