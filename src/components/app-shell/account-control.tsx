"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatRoleLabel } from "@/domain/presentation/labels";

export interface AccountControlUser {
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "USER";
}

function getInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toUpperCase() || "MB";
}

export function AccountControl({
  user,
  collapsed = false,
}: {
  user: AccountControlUser;
  collapsed?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${collapsed ? "flex-col" : "px-1"}`}
    >
      <Avatar className="size-8 border">
        <AvatarFallback className="bg-card text-xs font-semibold">
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
        <p className="truncate text-xs font-medium">{user.name}</p>
        <p className="text-muted-foreground truncate text-[0.6875rem]">
          {formatRoleLabel(user.role)}
        </p>
      </div>
      <Button
        aria-label="Log out"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await signOut({ callbackUrl: "/login" });
          });
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {isPending ? (
          <ShieldCheck aria-hidden="true" className="animate-pulse" />
        ) : (
          <LogOut aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
