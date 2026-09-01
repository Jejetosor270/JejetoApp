import type { Metadata } from "next";

import {
  ItemManagementSettingForm,
  SettingsForm,
} from "@/app/(app)/settings/settings-form";
import { LocationForm } from "@/components/items/location-form";
import { LocationList } from "@/components/items/location-list";
import {
  DEFAULT_ITEM_EXTRACTION_MODEL,
  ITEM_EXTRACTION_PROVIDER,
} from "@/config/item-extraction";
import {
  CLIENT_DOCUMENT_EXTRACTION_PROVIDER,
  DEFAULT_CLIENT_DOCUMENT_EXTRACTION_MODEL,
} from "@/config/client-document-extraction";
import {
  DEFAULT_QUOTE_EXTRACTION_MODEL,
  QUOTE_EXTRACTION_PROVIDER,
} from "@/config/quote-extraction";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { listLogisticsLocations } from "@/lib/items/items";
import { getApplicationSettings } from "@/lib/settings/application-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireMasterDataEditor();
  const [settings, locations] = await Promise.all([
    getApplicationSettings(),
    listLogisticsLocations(),
  ]);
  const model = process.env.QUOTE_EXTRACTION_MODEL?.trim()
    ? process.env.QUOTE_EXTRACTION_MODEL
    : DEFAULT_QUOTE_EXTRACTION_MODEL;
  const itemModel =
    process.env.ITEM_EXTRACTION_MODEL?.trim() || DEFAULT_ITEM_EXTRACTION_MODEL;
  const clientDocumentModel =
    process.env.CLIENT_DOCUMENT_EXTRACTION_MODEL?.trim() ||
    DEFAULT_CLIENT_DOCUMENT_EXTRACTION_MODEL;
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
        <h2 className="text-sm font-semibold">Client document extraction</h2>
        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{CLIENT_DOCUMENT_EXTRACTION_PROVIDER}</dd>
          <dt className="text-muted-foreground mt-2">Configured model</dt>
          <dd className="font-mono">{clientDocumentModel}</dd>
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">
          CLIENT_DOCUMENT_EXTRACTION_MODEL is independent from Supplier Quote
          and Item extraction. Secrets remain server-side.
        </p>
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Company</h2>
        <div className="mt-4">
          <SettingsForm companyName={settings.companyName} />
        </div>
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Optional modules</h2>
        {user.role === "ADMIN" ? (
          <div className="mt-4">
            <ItemManagementSettingForm
              enabled={settings.itemManagementEnabled}
            />
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Item Management (Beta) is{" "}
            {settings.itemManagementEnabled ? "enabled" : "disabled"}. Only an
            ADMIN can change this setting.
          </p>
        )}
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Item extraction</h2>
        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{ITEM_EXTRACTION_PROVIDER}</dd>
          <dt className="text-muted-foreground mt-2">Configured model</dt>
          <dd className="font-mono">{itemModel}</dd>
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">
          The optional server-side ITEM_EXTRACTION_MODEL controls spreadsheet
          semantic mapping and PDF line extraction independently of quote
          totals.
        </p>
      </section>
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Logistics Locations</h2>
        <p className="text-muted-foreground mt-2 text-xs">
          Reusable operational destinations only; this does not track inventory.
        </p>
        <div className="mt-4">
          <LocationForm />
        </div>
        <LocationList locations={locations} />
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
