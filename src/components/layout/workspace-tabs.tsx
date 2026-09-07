"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { tabClassName, tabListClassName } from "./tab-styles";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

export interface WorkspaceTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Presentation-only navigation. Panels stay mounted, including unsaved editors. */
export function WorkspaceTabs({
  tabs,
  label,
  queryKey = "tab",
}: {
  tabs: WorkspaceTab[];
  label: string;
  queryKey?: string;
}) {
  const search = useSearchParams();
  const id = useId();
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => "",
  );
  const selected =
    tabs.find((tab) => tab.id === (search.get(queryKey) || hash))?.id ??
    tabs[0]?.id;
  function select(tabId: string) {
    const next = new URLSearchParams(window.location.search);
    next.set(queryKey, tabId);
    window.history.pushState(null, "", `${window.location.pathname}?${next}`);
  }
  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={label}
        className={tabListClassName}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const index = tabs.findIndex((tab) => tab.id === selected);
          const target =
            event.key === "Home"
              ? tabs[0]
              : event.key === "End"
                ? tabs.at(-1)
                : tabs[
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      tabs.length) %
                      tabs.length
                  ];
          if (target) {
            select(target.id);
            document.getElementById(`${id}-${target.id}`)?.focus();
          }
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${id}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            aria-controls={`${id}-${tab.id}-panel`}
            tabIndex={selected === tab.id ? 0 : -1}
            onClick={() => select(tab.id)}
            className={tabClassName(selected === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${id}-${tab.id}-panel`}
          aria-labelledby={`${id}-${tab.id}`}
          hidden={selected !== tab.id}
          className="space-y-6"
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
