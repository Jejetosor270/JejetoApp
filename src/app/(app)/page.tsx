import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NavigationTabs } from "@/components/layout/navigation-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/listing/pagination";
import { FinancialAttentionTable } from "@/components/reporting/financial-attention-table";
import { requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getFinancialAttention } from "@/lib/reporting/financial-attention";
import {
  attentionHorizons,
  type AttentionHorizon,
} from "@/domain/finance/attention";
import { isAttentionSnoozed } from "@/domain/finance/attention-snooze";
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";

export const metadata: Metadata = { title: "Home" };
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const horizon: AttentionHorizon =
    query.horizon === "7" ? 7 : query.horizon === "90" ? 90 : 30;
  const snoozed = query.attention === "snoozed";
  const today = businessToday();
  const [snapshot, preferences] = await Promise.all([
    getFinancialAttention(horizon, today),
    getDatabase().financialAttentionSnooze.findMany({
      where: { userId: user.id, until: { gt: dateOnlyToDate(today) } },
    }),
  ]);
  const snoozes = new Map(
    preferences.map((row) => [
      row.issueKey,
      {
        fingerprint: row.fingerprint,
        until: dateToDateOnly(row.until),
        reason: row.reason,
      },
    ]),
  );
  const all = snapshot.issues.map((issue) => ({
    ...issue,
    snooze: isAttentionSnoozed(issue, snoozes.get(issue.key), today)
      ? (snoozes.get(issue.key) ?? null)
      : null,
  }));
  const filtered = all.filter((issue) => snoozed === (issue.snooze !== null));
  const pageSize =
    query.pageSize === "50" ? 50 : query.pageSize === "100" ? 100 : 25;
  const requestedPage =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page)
      ? Math.max(1, Number(query.page))
      : 1;
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  );
  const href = (days: number, state = snoozed ? "snoozed" : "active") =>
    "/?horizon=" + days + "&attention=" + state;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Financial attention across non-archived Projects."
        actions={
          <Button asChild variant="outline">
            <Link href="/reports">Open Reports</Link>
          </Button>
        }
      />
      <section
        className="record-surface space-y-4"
        aria-labelledby="financial-attention-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="financial-attention-heading" className="section-title">
            Financial attention
          </h2>
          <nav aria-label="Attention horizon" className="flex flex-wrap gap-2">
            {attentionHorizons.map((days) => (
              <Button
                asChild
                size="sm"
                variant={days === horizon ? "default" : "outline"}
                key={days}
              >
                <Link
                  key={days}
                  href={href(days)}
                  aria-current={days === horizon ? "page" : undefined}
                >
                  Next {days} days
                </Link>
              </Button>
            ))}
          </nav>
        </div>
        <p className="text-muted-foreground text-xs">
          Overdue and incomplete-data issues always appear. Future due dates
          follow the selected horizon. Amounts retain their own currency and
          HT/TTC basis; no combined money total. Unassigned records and archived
          Projects are outside this view.
        </p>
        <NavigationTabs
          label="Attention visibility"
          tabs={[
            {
              id: "active",
              label: `Needs attention (${all.filter((row) => !row.snooze).length})`,
              href: href(horizon, "active"),
              active: !snoozed,
            },
            {
              id: "snoozed",
              label: `Snoozed by me (${all.filter((row) => row.snooze).length})`,
              href: href(horizon, "snoozed"),
              active: snoozed,
            },
          ]}
        />
        <div className="bg-card overflow-hidden rounded-lg border">
          <FinancialAttentionTable
            rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
            today={today}
            horizon={horizon}
            snoozed={snoozed}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pathname="/"
            queryString={
              "horizon=" +
              horizon +
              "&attention=" +
              (snoozed ? "snoozed" : "active")
            }
          />
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex justify-between">
          <h2 className="section-title">Active Projects</h2>
          <Link
            href="/projects?status=ACTIVE"
            className="text-primary text-sm underline"
          >
            View all Projects
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.projects
            .filter((project) => project.status === "ACTIVE")
            .slice(0, 6)
            .map((project) => (
              <Link
                key={project.id}
                href={"/projects/" + project.id}
                className="bg-card hover:border-primary/40 hover:bg-accent/40 block rounded-lg border p-4 text-sm font-medium shadow-[var(--shadow-surface)]"
              >
                {project.name}{" "}
                <span className="text-muted-foreground">· {project.code}</span>
              </Link>
            ))}
          {!snapshot.projects.some(
            (project) => project.status === "ACTIVE",
          ) && <EmptyState title="No active Projects." />}
        </div>
      </section>
    </div>
  );
}
