"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function SettingsNavigation({
  role,
}: {
  role: "ADMIN" | "MANAGER" | "USER";
}) {
  const pathname = usePathname();
  const links = [
    { href: "/settings", label: "Settings" },
    ...(role === "ADMIN" ? [{ href: "/admin/users", label: "Employees" }] : []),
    { href: "/admin/activity", label: "Activity" },
  ];
  return (
    <nav aria-label="Administration" className="mb-6 flex gap-5 border-b">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`border-b-2 px-1 py-3 text-sm font-medium ${pathname === item.href ? "border-primary text-primary" : "text-muted-foreground border-transparent"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
