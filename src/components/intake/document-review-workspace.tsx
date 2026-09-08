"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentPreview } from "./use-document-preview";

function DocumentPane({ source }: { source: DocumentPreview }) {
  const [zoom, setZoom] = useState(100);
  return (
    <section
      className="bg-card overflow-hidden rounded-lg border"
      aria-label="Original document preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <p className="min-w-0 text-sm font-medium break-all">
          {source.filename}
        </p>
        {source.type === "image" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom out document"
              disabled={zoom <= 50}
              onClick={() => setZoom((value) => value - 25)}
            >
              −
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoom(100)}
            >
              Fit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom in document"
              disabled={zoom >= 250}
              onClick={() => setZoom((value) => value + 25)}
            >
              +
            </Button>
          </div>
        )}
      </div>
      {source.type === "pdf" ? (
        <iframe
          title={`Original document: ${source.filename}`}
          src={source.url}
          className="h-[70svh] w-full bg-white"
        />
      ) : (
        <div className="h-[70svh] overflow-auto">
          <Image
            src={source.url}
            alt={`Original document: ${source.filename}`}
            width={1600}
            height={1600}
            unoptimized
            style={{ width: `${zoom}%`, height: "auto", maxWidth: "none" }}
          />
        </div>
      )}
      <p className="text-muted-foreground border-t p-3 text-xs">
        Temporary preview. Cleared when you save or close onboarding.
      </p>
    </section>
  );
}

export function DocumentReviewWorkspace({
  source,
  children,
}: {
  source: DocumentPreview | null;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(42);
  const [dragging, setDragging] = useState(false);
  const [mobileView, setMobileView] = useState("review");
  const resize = (next: number) => setWidth(Math.min(60, Math.max(30, next)));
  return (
    <div
      ref={container}
      style={{ "--document-width": `${width}%` } as CSSProperties}
      className={
        source
          ? "grid items-start gap-y-4 lg:grid-cols-[var(--document-width)_1rem_minmax(0,1fr)]"
          : "grid grid-cols-1"
      }
    >
      {source && (
        <div className="flex gap-2 lg:hidden" aria-label="Onboarding view">
          <Button
            type="button"
            variant="outline"
            aria-pressed={mobileView === "document"}
            onClick={() => setMobileView("document")}
          >
            Document
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={mobileView === "review"}
            onClick={() => setMobileView("review")}
          >
            Review
          </Button>
        </div>
      )}
      {source && (
        <aside
          className={`${mobileView === "document" ? "block" : "hidden"} min-w-0 lg:sticky lg:top-0 lg:block ${dragging ? "pointer-events-none" : ""}`}
        >
          <DocumentPane key={source.url} source={source} />
        </aside>
      )}
      {source && (
        <div
          role="separator"
          aria-label="Resize document preview"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={60}
          aria-valuenow={width}
          tabIndex={0}
          className="focus-visible:ring-ring hidden h-[75svh] cursor-col-resize touch-none items-center justify-center outline-none focus-visible:ring-2 lg:sticky lg:top-0 lg:flex"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              resize(width + (event.key === "ArrowLeft" ? -5 : 5));
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            const bounds = container.current?.getBoundingClientRect();
            if (bounds?.width)
              resize(((event.clientX - bounds.left) / bounds.width) * 100);
          }}
          onPointerUp={(event) => {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => setDragging(false)}
          onLostPointerCapture={() => setDragging(false)}
        >
          <span className="bg-border h-12 w-1 rounded-full" />
        </div>
      )}
      <div
        className={`@container min-w-0 ${source && mobileView === "document" ? "hidden lg:block" : "block"}`}
      >
        {children}
      </div>
    </div>
  );
}
