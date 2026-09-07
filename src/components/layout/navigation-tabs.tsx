import Link from "next/link";
import { tabClassName, tabListClassName } from "./tab-styles";

/** URL navigation styled like workspace tabs, without changing route loading. */
export function NavigationTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { id: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className={tabListClassName}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={tabClassName(tab.active)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
