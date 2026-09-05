"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function hasUnsavedDrafts(element: ParentNode = document): boolean {
  return element.querySelector('[data-dirty="true"]') !== null;
}

/** Drafts stay in memory. Nothing here stores business data in browser storage. */
export function DraftGuard({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    let approvedNavigation = false;
    function changed(event: Event) {
      approvedNavigation = false;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const form = target.closest("form");
      if (
        !form ||
        form.getAttribute("action")?.startsWith("/") ||
        form.dataset.draftGuard === "off"
      )
        return;
      form.dataset.dirty = "true";
      approvedNavigation = false;
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!approvedNavigation && hasUnsavedDrafts(container ?? document))
        event.preventDefault();
    }
    function navigate(event: MouseEvent) {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href);
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      if (
        hasUnsavedDrafts(container ?? document) &&
        !window.confirm("Discard your unsaved changes and leave this page?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        approvedNavigation = true;
      }
    }
    // The Navigation API can cancel browser Back/Forward before an SPA unmount.
    // Older browsers still receive the link and unload guards above.
    const navigation = (window as unknown as { navigation?: EventTarget })
      .navigation;
    function navigationIntent(event: Event) {
      const destination = (event as Event & { destination?: { url: string } })
        .destination;
      if (
        !destination ||
        !event.cancelable ||
        approvedNavigation ||
        !hasUnsavedDrafts(container ?? document)
      )
        return;
      const next = new URL(destination.url);
      const current = new URL(location.href);
      next.searchParams.delete("tab");
      current.searchParams.delete("tab");
      if (next.pathname === current.pathname && next.search === current.search)
        return;
      if (!window.confirm("Discard your unsaved changes and leave this page?"))
        event.preventDefault();
      else approvedNavigation = true;
    }
    container.addEventListener("input", changed);
    container.addEventListener("change", changed);
    document.addEventListener("click", navigate, true);
    window.addEventListener("beforeunload", beforeUnload);
    navigation?.addEventListener("navigate", navigationIntent);
    return () => {
      container.removeEventListener("input", changed);
      container.removeEventListener("change", changed);
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("beforeunload", beforeUnload);
      navigation?.removeEventListener("navigate", navigationIntent);
    };
  }, []);
  return <div ref={root}>{children}</div>;
}
