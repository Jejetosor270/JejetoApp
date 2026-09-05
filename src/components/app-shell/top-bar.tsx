import Link from "next/link";
import { Search } from "lucide-react";
import type { AccountControlUser } from "@/components/app-shell/account-control";
import { MobileNavigation } from "@/components/app-shell/mobile-navigation";
export function TopBar({
  companyName,
  itemManagementEnabled,
  user,
}: {
  companyName: string;
  itemManagementEnabled: boolean;
  user: AccountControlUser;
}) {
  return (
    <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur-sm lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavigation
          companyName={companyName}
          itemManagementEnabled={itemManagementEnabled}
          user={user}
        />
        <span className="truncate text-sm font-semibold">{companyName}</span>
      </div>
      <Link
        href="/search"
        aria-label="Search records"
        className="rounded-md p-2"
      >
        <Search className="size-[18px]" />
      </Link>
    </header>
  );
}
