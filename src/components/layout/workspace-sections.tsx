"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

export interface WorkspaceSection {
  id: string;
  label: string;
  content: ReactNode;
  expanded?: boolean;
}

/** Native disclosures keep every editor mounted. Old tab/hash links open the section. */
export function WorkspaceSections({
  sections,
  label,
}: {
  sections: WorkspaceSection[];
  label: string;
}) {
  const search = useSearchParams();
  const root = useRef<HTMLDivElement>(null);
  const requested = search.get("tab");
  useEffect(() => {
    function reveal() {
      const id = requested || window.location.hash.slice(1);
      const section = Array.from(root.current?.children ?? []).find(
        (element) => element.id === id,
      );
      if (section instanceof HTMLDetailsElement) section.open = true;
      section?.scrollIntoView?.({ block: "start" });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [requested]);

  return (
    <div ref={root} aria-label={label} className="space-y-4">
      {sections.map((section, index) =>
        index === 0 ? (
          <section id={section.id} key={section.id} className="space-y-4">
            {section.content}
          </section>
        ) : (
          <details
            id={section.id}
            key={section.id}
            open={section.expanded || undefined}
            className="bg-card scroll-mt-4 rounded-lg border"
          >
            <summary className="focus-visible:outline-ring cursor-pointer rounded-lg px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
              {section.label}
            </summary>
            <div className="space-y-4 border-t p-4">{section.content}</div>
          </details>
        ),
      )}
    </div>
  );
}
