import { PageHeader } from "@/components/layout/page-header";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { SettingsNavigation } from "@/components/layout/settings-navigation";
import { WorkspaceSections } from "@/components/layout/workspace-sections";
import type { Metadata } from "next";

import {
  ItemManagementSettingForm,
  SettingsForm,
} from "@/app/(app)/settings/settings-form";
import { LocationForm } from "@/components/items/location-form";
import { LocationList } from "@/components/items/location-list";
import { AiProcessingForm } from "./ai-processing-form";
import { getAiProcessingModels } from "@/lib/settings/ai-processing-settings";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { listLogisticsLocations } from "@/lib/items/items";
import { getApplicationSettings } from "@/lib/settings/application-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireMasterDataEditor();
  const [settings, locations, models] = await Promise.all([
    getApplicationSettings(),
    listLogisticsLocations(),
    getAiProcessingModels(),
  ]);
  return (
    <div className="space-y-6">
      <SettingsNavigation role={user.role} />
      <PageHeader
        title="Application settings"
        description={
          <>Company details, optional modules, and operational preferences.</>
        }
      />
      <WorkspaceSections
        label="Settings sections"
        sections={[
          {
            id: "company",
            label: "Company",
            content: (
              <>
                <section className="bg-card rounded-lg border p-5">
                  <h2 className="text-sm font-semibold">Company</h2>
                  <div className="mt-4">
                    <SettingsForm companyName={settings.companyName} />
                  </div>
                </section>
                <section className="bg-card rounded-lg border p-5">
                  <h2 className="text-sm font-semibold">Financial reporting</h2>
                  <dl className="mt-4 grid gap-1 text-sm">
                    <dt className="text-muted-foreground">
                      Company reporting currency
                    </dt>
                    <dd className="font-mono font-semibold">
                      {settings.companyReportingCurrencyCode}
                    </dd>
                  </dl>
                  <p className="text-muted-foreground mt-3 max-w-2xl text-xs leading-5">
                    Company reporting currency is fixed. Projects retain their
                    own reporting currencies and historical manual FX rates.
                  </p>
                </section>
              </>
            ),
          },
          {
            id: "modules",
            label: "Optional modules",
            content: (
              <>
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
                      {settings.itemManagementEnabled ? "enabled" : "disabled"}.
                      Only an ADMIN can change this setting.
                    </p>
                  )}
                </section>
              </>
            ),
          },
          {
            id: "locations",
            label: "Locations",
            content: (
              <>
                <section className="bg-card rounded-lg border p-5">
                  <h2 className="text-sm font-semibold">Logistics Locations</h2>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Reusable operational destinations only; this does not track
                    inventory.
                  </p>
                  <div className="mt-4">
                    <EditorDrawer title="Add location">
                      <LocationForm />
                    </EditorDrawer>
                  </div>
                  <LocationList locations={locations} />
                </section>
              </>
            ),
          },
          {
            id: "diagnostics",
            label: "AI processing",
            content: (
              <section className="bg-card rounded-lg border p-5">
                <h2 className="text-sm font-semibold">AI processing models</h2>
                <div className="mt-4">
                  <AiProcessingForm models={models} />
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
