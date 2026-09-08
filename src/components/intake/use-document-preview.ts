"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DocumentPreview {
  url: string;
  filename: string;
  type: "pdf" | "image";
}

/** Browser memory only. No source bytes enter persisted application state. */
export function useDocumentPreview(maximumBytes: number) {
  const activeUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const release = useCallback(() => {
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
  }, []);
  const clear = useCallback(() => {
    release();
    setPreview(null);
  }, [release]);
  const select = useCallback(
    (file: File | undefined) => {
      release();
      setPreview(null);
      if (!file || !file.size || file.size > maximumBytes) return;
      const extension = file.name.split(".").pop()?.toLowerCase();
      const mime =
        extension === "pdf"
          ? "application/pdf"
          : extension === "png"
            ? "image/png"
            : extension === "jpg" || extension === "jpeg"
              ? "image/jpeg"
              : null;
      if (!mime || (file.type && file.type !== mime)) return;
      const url = URL.createObjectURL(new Blob([file], { type: mime }));
      activeUrl.current = url;
      setPreview({
        url,
        filename: file.name,
        type: mime === "application/pdf" ? "pdf" : "image",
      });
    },
    [maximumBytes, release],
  );
  useEffect(() => release, [release]);
  return { preview, select, clear };
}
