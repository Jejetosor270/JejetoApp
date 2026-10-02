import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NavigationTabs } from "@/components/layout/navigation-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/listing/pagination";
import { FinancialAttentionTable } from "@/components/reporting/financial-attention-table";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getAttentionWorkspace } from "@/lib/reporting/attention-workspace";
import {
  attentionFollowUpKey,
  attentionWorkspaceQuery,
  isAttentionDataQuality,
  matchesAttentionOwner,
  type AttentionOwnerFilter,
  type AttentionScope,
} from "@/domain/finance/attention-follow-up";
import { Field, inputClassName } from "@/components/master-data/form-ui";
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
  const owner: AttentionOwnerFilter =
    query.owner === "mine"
      ? "mine"
      : query.owner === "unassigned"
        ? "unassigned"
        : "all";
  const scope: AttentionScope =
    query.scope === "data-quality" ? "data-quality" : "all";
  const canEdit = canEditMasterData(user.role);
  const today = businessToday();
  const [snapshot, preferences, employees] = await Promise.all([
    getAttentionWorkspace(horizon, today),
    getDatabase().financialAttentionSnooze.findMany({
      where: { userId: user.id, until: { gt: dateOnlyToDate(today) } },
    }),
    canEdit
      ? getDatabase().user.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const followUps = await getDatabase().financialFollowUp.findMany({
    where: {
      issueKey: {
        in: snapshot.issues.flatMap((issue) => {
          const key = attentionFollowUpKey(issue.key);
          return key ? [key] : [];
        }),
      },
    },
    select: {
      issueKey: true,
      version: true,
      assigneeId: true,
      assignee: { select: { name: true } },
      nextFollowUpDate: true,
      note: true,
    },
  });
  const followUpMap = new Map(
    followUps.map((row) => [
      row.issueKey,
      {
        version: row.version,
        assigneeId: row.assigneeId,
        assigneeName: row.assignee?.name ?? null,
        nextFollowUpDate: row.nextFollowUpDate
          ? dateToDateOnly(row.nextFollowUpDate)
          : null,
        note: row.note,
      },
    ]),
  );
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
    followUp: followUpMap.get(attentionFollowUpKey(issue.key) ?? "") ?? null,
    snooze: isAttentionSnoozed(issue, snoozes.get(issue.key), today)
      ? (snoozes.get(issue.key) ?? null)
      : null,
  }));
  const scoped = all.filter(
    (issue) =>
      (scope === "all" || isAttentionDataQuality(issue)) &&
      matchesAttentionOwner(issue.followUp, owner, user.id),
  );
  const filtered = scoped.filter(
    (issue) => snoozed === (issue.snooze !== null),
  );
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
    "/?" +
    attentionWorkspaceQuery({
      horizon: days,
      snoozed: state === "snoozed",
      owner,
      scope,
      pageSize,
    });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Financial attention, shared follow-ups and data quality."
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
          HT/TTC basis; no combined money total. Data quality also highlights
          unassigned financial records and archived Projects with open balances.
          A filter hiding an issue does not mean it is resolved.
        </p>
        <form className="flex flex-wrap items-end gap-3" action="/">
          <input type="hidden" name="horizon" value={horizon} />
          <input
            type="hidden"
            name="attention"
            value={snoozed ? "snoozed" : "active"}
          />
          <input type="hidden" name="pageSize" value={pageSize} />
          <Field label="Scope">
            <select
              name="scope"
              defaultValue={scope}
              className={inputClassName}
            >
              <option value="all">All attention</option>
              <option value="data-quality">Data quality</option>
            </select>
          </Field>
          <Field label="Owner">
            <select
              name="owner"
              defaultValue={owner}
              className={inputClassName}
            >
              <option value="all">All owners</option>
              <option value="mine">Mine</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </Field>
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
        <NavigationTabs
          label="Attention visibility"
          tabs={[
            {
              id: "active",
              label: `Needs attention (${scoped.filter((row) => !row.snooze).length})`,
              href: href(horizon, "active"),
              active: !snoozed,
            },
            {
              id: "snoozed",
              label: `Snoozed by me (${scoped.filter((row) => row.snooze).length})`,
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
            canEdit={canEdit}
            employees={employees}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pathname="/"
            queryString={attentionWorkspaceQuery({
              horizon,
              snoozed,
              owner,
              scope,
              pageSize,
            })}
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
