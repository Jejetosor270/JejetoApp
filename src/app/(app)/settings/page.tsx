import type { Metadata } from "next";

import { SettingsForm } from "@/app/(app)/settings/settings-form";
import {
  DEFAULT_QUOTE_EXTRACTION_MODEL,
  QUOTE_EXTRACTION_PROVIDER,
} from "@/config/quote-extraction";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getApplicationSettings } from "@/lib/settings/application-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireMasterDataEditor();
  const settings = await getApplicationSettings();
  const model = process.env.QUOTE_EXTRACTION_MODEL?.trim()
    ? process.env.QUOTE_EXTRACTION_MODEL
    : DEFAULT_QUOTE_EXTRACTION_MODEL;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Application settings
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Safe operational configuration. Secrets remain server-side.
        </p>
      </header>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Company</h2>
        <div className="mt-4">
          <SettingsForm companyName={settings.companyName} />
        </div>
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Financial reporting</h2>
        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-muted-foreground">Company reporting currency</dt>
          <dd className="font-mono font-semibold">
            {settings.companyReportingCurrencyCode}
          </dd>
        </dl>
        <p className="text-muted-foreground mt-3 max-w-2xl text-xs leading-5">
          Read-only in Phase 9. Existing Projects retain their own reporting
          currencies and historical FX assumptions; changing the portfolio
          currency at runtime could silently reinterpret historical totals.
        </p>
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">AI quote extraction</h2>
        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{QUOTE_EXTRACTION_PROVIDER}</dd>
          <dt className="text-muted-foreground mt-2">Configured model</dt>
          <dd className="font-mono">{model}</dd>
        </dl>
        <p className="text-muted-foreground mt-3 max-w-2xl text-xs leading-5">
          The optional server-side QUOTE_EXTRACTION_MODEL environment variable
          remains authoritative. API keys and secret values are never shown.
        </p>
      </section>
    </div>
  );
}
