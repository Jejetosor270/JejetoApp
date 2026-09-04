import Decimal from "decimal.js";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClientDetailEditor } from "@/app/(app)/clients/client-management";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import { formatDateOnly, formatTimestamp } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listClientBillingPage } from "@/lib/billing/billing";
import { getDatabase } from "@/lib/db";
import { getClient } from "@/lib/master-data/clients";
import { listActiveCurrencies } from "@/lib/master-data/lookups";

export const metadata: Metadata = { title: "Client" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();
  const [user, client, currencies, projects, billing, activity] =
    await Promise.all([
      requireUser(),
      getClient(clientId),
      listActiveCurrencies(),
      getDatabase().project.findMany({
        where: { clientId },
        orderBy: { name: "asc" },
        select: {
          code: true,
          id: true,
          name: true,
          reportingCurrencyCode: true,
          status: true,
        },
      }),
      listClientBillingPage({
        clientId,
        direction: "desc",
        page: 1,
        pageSize: 100,
        query: "",
        sort: "date",
      }),
      getDatabase().auditEvent.findMany({
        where: { entityId: clientId, entityType: "CLIENT" },
        orderBy: { occurredAt: "desc" },
        take: 20,
      }),
    ]);
  if (!client) notFound();
  const invoiceTotals = new Map<
    string,
    { invoiced: Decimal; outstanding: Decimal; paid: Decimal }
  >();
  for (const document of billing.items) {
    if (document.documentType !== "INVOICE" || document.isCancelled) continue;
    const totals = invoiceTotals.get(document.currencyCode) ?? {
      invoiced: new Decimal(0),
      outstanding: new Decimal(0),
      paid: new Decimal(0),
    };
    totals.invoiced = totals.invoiced.plus(document.totalTtc);
    totals.outstanding = totals.outstanding.plus(document.outstanding);
    totals.paid = totals.paid.plus(document.paid);
    invoiceTotals.set(document.currencyCode, totals);
  }
  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/clients"
        backLabel="Clients"
        eyebrow="Directory · Client"
        meta={client.legalName}
        status={client.isActive ? "ACTIVE" : "ARCHIVED"}
        title={client.displayName}
      />

      <ClientDetailEditor
        canEdit={canEditMasterData(user.role)}
        client={client}
        currencies={currencies}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Projects</h2>
          <div className="mt-3 divide-y">
            {projects.map((project) => (
              <Link
                className="flex justify-between gap-3 py-2 text-sm hover:underline"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <span>
                  {project.name} · {project.code}
                </span>
                <span className="text-muted-foreground">
                  {formatEnumLabel(project.status)} ·{" "}
                  {project.reportingCurrencyCode}
                </span>
              </Link>
            ))}
            {projects.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">No Projects.</p>
            ) : null}
          </div>
        </article>
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            Billing & collection summary
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {[...invoiceTotals].map(([currency, totals]) => (
              <div
                className="grid grid-cols-3 gap-2 rounded-md border p-3"
                key={currency}
              >
                <p>
                  Invoiced
                  <br />
                  <strong>
                    {formatMoney(totals.invoiced.toString(), currency)}
                  </strong>
                </p>
                <p>
                  Received
                  <br />
                  <strong>
                    {formatMoney(totals.paid.toString(), currency)}
                  </strong>
                </p>
                <p>
                  Outstanding
                  <br />
                  <strong>
                    {formatMoney(totals.outstanding.toString(), currency)}
                  </strong>
                </p>
              </div>
            ))}
            <Link
              className="text-primary inline-block underline"
              href={`/billing?clientId=${client.id}`}
            >
              View all Billing Events
            </Link>
          </div>
        </article>
      </section>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Recent Billing Events</h2>
        <div className="mt-3 divide-y text-sm">
          {billing.items.slice(0, 10).map((document) => (
            <Link
              className="grid gap-2 py-2 hover:underline sm:grid-cols-4"
              href={`/billing/${document.id}`}
              key={document.id}
            >
              <span>{document.reference}</span>
              <span>{document.documentType}</span>
              <span>{formatDateOnly(document.documentDate)}</span>
              <span className="financial-figure text-right">
                {formatMoney(document.outstanding, document.currencyCode)}{" "}
                outstanding
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="mt-3 divide-y text-sm">
          {activity.map((event) => (
            <p className="py-2" key={event.id}>
              {event.summary}{" "}
              <span className="text-muted-foreground">
                · {event.actorName} · {formatTimestamp(event.occurredAt)}
              </span>
            </p>
          ))}
          {activity.length === 0 ? (
            <p className="text-muted-foreground py-4">No activity recorded.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
