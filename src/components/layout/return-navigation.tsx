"use client";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

class ReturnPathStore {
  private paths = new Map<string, string>();
  private listeners = new Set<() => void>();
  get = (path: string) => this.paths.get(path) ?? path;
  record(path: string, url: string) {
    if (this.get(path) === url) return;
    this.paths.set(path, url);
    this.listeners.forEach((listener) => listener());
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
const ReturnPaths = createContext<ReturnPathStore | null>(null);
const subscribeToNothing = () => () => {};
const listPaths = new Set([
  "/projects",
  "/orders",
  "/clients",
  "/suppliers",
  "/billing",
  "/payments",
  "/items",
]);

/** Session-memory only: returning from a record preserves the last list's filters. */
export function ReturnNavigation({ children }: { children: ReactNode }) {
  const [paths] = useState(() => new ReturnPathStore());
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (listPaths.has(pathname))
      paths.record(pathname, pathname + (search ? `?${search}` : ""));
  }, [paths, pathname, search]);
  return <ReturnPaths.Provider value={paths}>{children}</ReturnPaths.Provider>;
}

export function ReturnLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const paths = useContext(ReturnPaths);
  const destination = useSyncExternalStore(
    paths?.subscribe ?? subscribeToNothing,
    () => paths?.get(href) ?? href,
    () => href,
  );
  return (
    <Link href={destination} className={className}>
      {children}
    </Link>
  );
}
