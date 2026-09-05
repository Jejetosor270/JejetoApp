import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader
        title="Import Supplier document"
        description={
          <>
            Select the Project first, upload one Supplier quote or invoice, then
            review every extracted value before anything is written to the ERP.
          </>
        }
      />
      <QuoteIntake options={options} />
    </div>
  );
}
