"use client";

import { useRouter } from "next/navigation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { QuoteIntake } from "@/components/quote-intake/quote-intake";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";

export function OrderIntakePanel({ options }: { options: QuoteIntakeOptions }) {
  const router = useRouter();
  return (
    <EditorDrawer
      open
      wide
      title="Import Supplier document"
      onOpenChange={(open) => {
        if (!open) router.push("/orders");
      }}
    >
      <QuoteIntake options={options} />
    </EditorDrawer>
  );
}
