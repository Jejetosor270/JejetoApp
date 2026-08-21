import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  CircleDot,
  Database,
  Layers3,
  ShieldCheck,
  Sigma,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Foundation",
};

const foundationLayers = [
  {
    name: "Interface",
    detail: "Responsive application shell and reusable design tokens",
    icon: Layers3,
  },
  {
    name: "Domain",
    detail: "Exact-decimal procurement finance calculations",
    icon: Sigma,
  },
  {
    name: "Data",
    detail: "Normalized PostgreSQL model with explicit relationships",
    icon: Database,
  },
  {
    name: "Security",
    detail: "Server-only database access and validated environment inputs",
    icon: ShieldCheck,
  },
] as const;

const roadmap = [
  { phase: "02", name: "Authentication & users", state: "Next" },
  { phase: "03", name: "Clients, suppliers & projects", state: "Planned" },
  { phase: "04", name: "Orders & margin engine", state: "Planned" },
  { phase: "05", name: "VAT & multi-currency", state: "Planned" },
] as const;

export default function FoundationPage() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.08em] uppercase">
            <CircleDot aria-hidden="true" className="text-positive size-3.5" />
            Phase 1 · Initial setup
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            Procurement finance foundation
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-[0.9375rem]">
            The application architecture is ready for secure employee access and
            the first operational master data. No production records are shown
            in this foundation view.
          </p>
        </div>
        <Badge
          className="border-positive/25 bg-positive-muted text-positive w-fit"
          variant="outline"
        >
          <Check aria-hidden="true" data-icon="inline-start" />
          Technical baseline complete
        </Badge>
      </section>

      <Separator />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.8fr)]">
        <section
          aria-labelledby="foundation-heading"
          className="bg-card overflow-hidden rounded-lg border"
        >
          <div className="border-b px-4 py-3.5 sm:px-5">
            <h2 id="foundation-heading" className="text-sm font-semibold">
              Foundation layers
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Deliberately small, production-oriented building blocks.
            </p>
          </div>
          <div className="divide-y">
            {foundationLayers.map((layer) => {
              const Icon = layer.icon;

              return (
                <div
                  key={layer.name}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[9rem_1fr] sm:px-5"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon aria-hidden="true" className="text-primary size-4" />
                    {layer.name}
                  </div>
                  <p className="text-muted-foreground text-sm leading-5">
                    {layer.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="hierarchy-heading"
          className="bg-card rounded-lg border p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="hierarchy-heading" className="text-sm font-semibold">
                Core hierarchy
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                The model’s organizing spine
              </p>
            </div>
            <Badge variant="secondary">Locked</Badge>
          </div>
          <ol className="mt-5 space-y-2.5">
            {[
              "Client",
              "Project",
              "House / building",
              "Supplier package",
              "Payment schedule",
            ].map((level, index) => (
              <li key={level} className="flex items-center gap-3 text-sm">
                <span className="financial-figure bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md border text-[0.6875rem] font-semibold">
                  {index + 1}
                </span>
                <span>{level}</span>
                {index < 4 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground/60 ms-auto size-3.5"
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-5 border-t pt-4 text-xs leading-5">
            Packages may apply to several buildings. Rooms, products, inventory,
            and warehouse concepts are intentionally excluded.
          </p>
        </section>
      </div>

      <section
        aria-labelledby="roadmap-heading"
        className="bg-card overflow-hidden rounded-lg border"
      >
        <div className="flex items-center justify-between border-b px-4 py-3.5 sm:px-5">
          <div>
            <h2 id="roadmap-heading" className="text-sm font-semibold">
              Delivery sequence
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Operational modules remain intentionally inactive.
            </p>
          </div>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            4 upcoming phases
          </span>
        </div>
        <div className="divide-y">
          {roadmap.map((item) => (
            <div
              key={item.phase}
              className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 sm:px-5"
            >
              <span className="financial-figure text-muted-foreground font-mono text-xs">
                {item.phase}
              </span>
              <span className="text-sm font-medium">{item.name}</span>
              <Badge variant={item.state === "Next" ? "default" : "outline"}>
                {item.state}
              </Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
