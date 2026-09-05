"use client";
import { Children, type ReactNode } from "react";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";

/** All events remain available; opening the agenda performs no new data read. */
export function OverflowList({
  children,
  limit,
  title,
}: {
  children: ReactNode;
  limit: number;
  title: string;
}) {
  const items = Children.toArray(children);
  return (
    <>
      {items.slice(0, limit)}
      {items.length > limit && (
        <EditorDrawer
          title={title}
          description={`${items.length} records`}
          trigger={
            <Button variant="ghost" size="sm" type="button">
              +{items.length - limit} more
            </Button>
          }
        >
          <div className="space-y-2">{items}</div>
        </EditorDrawer>
      )}
    </>
  );
}
