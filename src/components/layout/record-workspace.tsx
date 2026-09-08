import type { ReactNode } from "react";
import { WorkspaceTabs } from "./workspace-tabs";

export interface RecordSection {
  id: string;
  label: string;
  group: "details" | "related";
  content: ReactNode;
}

/** One record, two consistent tabs. Existing subsection URLs remain valid. */
export function RecordWorkspace({
  label,
  sections,
}: {
  label: string;
  sections: RecordSection[];
}) {
  return (
    <WorkspaceTabs
      label={label}
      aliases={Object.fromEntries(
        sections.map((section) => [section.id, section.group]),
      )}
      tabs={(["details", "related"] as const).map((group) => ({
        id: group,
        label: group === "details" ? "Details" : "Related",
        content: sections
          .filter((section) => section.group === group)
          .map((section) => (
            <section
              key={section.id}
              id={section.id}
              data-workspace-section={section.id}
              aria-label={section.label}
              className="scroll-mt-4 space-y-4"
            >
              {section.content}
            </section>
          )),
      }))}
    />
  );
}
