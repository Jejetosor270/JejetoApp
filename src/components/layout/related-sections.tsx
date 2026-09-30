"use client";
import { useId, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { RecordSection } from "./record-workspace";
import { Button } from "@/components/ui/button";

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

/** Local navigation keeps every editor mounted and preserves existing deep links. */
export function RelatedSections({ sections }: { sections: RecordSection[] }) {
  const search = useSearchParams();
  const id = useId();
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  // Main tabs and stale section IDs must not hide a valid legacy hash link.
  const requested = [search.get("section"), search.get("tab"), hash].find(
    (candidate) => sections.some((section) => section.id === candidate),
  );
  const selected =
    sections.find((section) => section.id === requested)?.id ?? sections[0]?.id;
  function select(section: string) {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", "related");
    next.set("section", section);
    window.history.pushState(null, "", `${window.location.pathname}?${next}`);
  }
  return (
    <div className="space-y-4">
      <nav
        aria-label="Project related sections"
        className="flex flex-wrap gap-2"
      >
        {sections.map((section) => (
          <Button
            key={section.id}
            type="button"
            size="sm"
            variant={selected === section.id ? "secondary" : "outline"}
            aria-pressed={selected === section.id}
            aria-controls={`${id}-${section.id}`}
            onClick={() => select(section.id)}
          >
            {section.label}
          </Button>
        ))}
      </nav>
      {sections.map((section) => (
        <section
          key={section.id}
          id={`${id}-${section.id}`}
          data-workspace-section={section.id}
          aria-label={section.label}
          hidden={selected !== section.id}
          className="space-y-4"
        >
          {section.content}
        </section>
      ))}
    </div>
  );
}
