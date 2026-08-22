"use client";

import { LogOut, ShieldCheck, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export function AccountControl({ user }: { user: AccountControlUser }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Avatar className="size-8 border">
        <AvatarFallback className="bg-card text-xs font-semibold">
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-xs font-medium">{user.name}</p>
        <p className="text-muted-foreground truncate text-[0.6875rem]">
          {user.email}
        </p>
      </div>
      <Badge className="hidden sm:inline-flex" variant="outline">
        {user.role.toLowerCase()}
      </Badge>
      {user.role === "ADMIN" ? (
        <Button asChild size="icon-sm" variant="ghost">
          <a aria-label="Manage employee accounts" href="/admin/users">
            <Users aria-hidden="true" />
          </a>
        </Button>
      ) : null}
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
