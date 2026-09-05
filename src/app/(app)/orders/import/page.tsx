import type { Metadata } from "next";

import { QuoteIntake } from "@/components/quote-intake/quote-intake";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { listQuoteIntakeOptions } from "@/lib/quote-intake/options";

export const metadata: Metadata = { title: "Import Supplier document" };
export const maxDuration = 120;

export default async function SupplierQuoteImportPage() {
  await requireMasterDataEditor();
  const options = await listQuoteIntakeOptions();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Procurement · AI-assisted intake
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Import Supplier document
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Select the Project first, upload one Supplier quote or invoice, then
          review every extracted value before anything is written to the ERP.
        </p>
      </header>
      <QuoteIntake options={options} />
    </div>
  );
}
