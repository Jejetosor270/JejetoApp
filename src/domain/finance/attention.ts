import Decimal from "decimal.js";
import { addDays } from "date-fns";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { installmentOutstanding } from "@/domain/payments/calculations";
import { reportingAmount } from "@/domain/finance/calculations";
import { formatRate } from "@/domain/procurement/presentation";

export const attentionHorizons = [7, 30, 90] as const;
export type AttentionHorizon = (typeof attentionHorizons)[number];
export interface AttentionIssue {
  key: string;
  priority: "Overdue" | "Action needed" | "Incomplete" | "Review" | "Upcoming";
  title: string;
  detail: string;
  projectId: string;
  projectName: string;
  reference: string;
  href: string;
  amount: string | null;
  currency: string;
  basis: "HT" | "TTC" | null;
  date: string | null;
}
export interface AttentionTerm {
  id: string;
  dueDate: string | null;
  currency: string;
  scheduled: string;
  paid: string;
  fx: string | null;
  cancelled: boolean;
  href: string;
  actualFxMissing: boolean;
}
export interface AttentionDocument {
  id: string;
  side: "supplier" | "client" | "freight";
  projectId: string;
  projectName: string;
  reportingCurrency: string;
  reference: string;
  partyId: string;
  href: string;
  date: string | null;
  dueDate: string | null;
  currency: string;
  totalHt: string | null;
  totalTtc: string | null;
  paid: string;
  issued: boolean;
  toInvoice: boolean;
  fxMissing: boolean;
  actualFxMissing: boolean;
  terms: AttentionTerm[];
}
export interface AttentionProject {
  id: string;
  name: string;
  currency: string;
  actualMarkup: string | null;
  targetMarkup: string | null;
}

const priorityOrder = [
  "Overdue",
  "Action needed",
  "Incomplete",
  "Review",
  "Upcoming",
];
const sum = (values: string[]) =>
  values.reduce((total, value) => total.plus(value), new Decimal(0));

/** Derived reminders only: never creates cash, schedules or financial state. */
export function buildFinancialAttention(
  documents: AttentionDocument[],
  projects: AttentionProject[],
  today: string,
  horizon: AttentionHorizon,
): AttentionIssue[] {
  const end = dateToDateOnly(addDays(dateOnlyToDate(today), horizon));
  const issues: AttentionIssue[] = [];
  const cash = new Map<
    string,
    { incoming: Decimal; outgoing: Decimal; complete: boolean }
  >();
  const duplicates = new Map<string, AttentionDocument[]>();
  const add = (
    doc: AttentionDocument,
    kind: string,
    title: string,
    priority: AttentionIssue["priority"],
    detail: string,
    amount: string | null = null,
    basis: AttentionIssue["basis"] = null,
    date: string | null = null,
    href = doc.href,
    currency = doc.currency,
  ) => {
    issues.push({
      key: `${kind}:${doc.id}`,
      title,
      priority,
      detail,
      amount,
      basis,
      date,
      href,
      currency,
      projectId: doc.projectId,
      projectName: doc.projectName,
      reference: doc.reference,
    });
  };
  for (const doc of documents) {
    if (doc.toInvoice && (!doc.date || doc.date <= end))
      add(
        doc,
        "issue-invoice",
        "Invoice needs issuing",
        doc.date && doc.date < today ? "Overdue" : "Action needed",
        "Issue this planned Invoice; it is not included in cash expectations.",
        doc.totalHt,
        "HT",
        doc.date,
      );
    if (!doc.issued) continue;
    if (doc.fxMissing)
      add(
        doc,
        "document-fx",
        "Missing reporting FX",
        "Incomplete",
        "Set the document’s manual FX to complete Project reporting.",
      );
    if (doc.actualFxMissing)
      add(
        doc,
        "actual-fx",
        "Missing actual payment FX",
        "Incomplete",
        "Review actual payments: their FX is independent of the document FX.",
      );
    const terms = doc.terms.filter((term) => !term.cancelled);
    const remaining =
      doc.totalTtc === null
        ? null
        : installmentOutstanding(doc.totalTtc, doc.paid);
    const comparable = terms.every((term) => term.currency === doc.currency);
    const scheduledRemaining = comparable
      ? sum(
          terms.map((term) =>
            installmentOutstanding(term.scheduled, term.paid).toString(),
          ),
        )
      : new Decimal(0);
    const mismatch =
      remaining !== null && comparable && !remaining.equals(scheduledRemaining);
    const hasBalance =
      remaining === null ||
      remaining.greaterThan(0) ||
      terms.some((term) =>
        installmentOutstanding(term.scheduled, term.paid).greaterThan(0),
      );
    if (hasBalance && (!comparable || mismatch || doc.totalTtc === null))
      add(
        doc,
        "schedule",
        "Review payment schedule",
        "Incomplete",
        !comparable
          ? "Terms use a different currency; coverage cannot be compared automatically."
          : "Remaining payment terms do not match the document’s remaining balance. Review terms and unassigned payments.",
        comparable && remaining !== null
          ? remaining.minus(scheduledRemaining).abs().toFixed(4)
          : null,
        "TTC",
      );
    if (hasBalance && terms.length === 0 && !doc.dueDate)
      add(
        doc,
        "missing-date",
        "Missing payment due date",
        "Incomplete",
        "Set a due date and review the payment terms.",
        remaining?.toFixed(4) ?? null,
        "TTC",
      );
    if (
      remaining?.greaterThan(0) &&
      terms.length === 0 &&
      doc.dueDate &&
      doc.dueDate <= end
    )
      add(
        doc,
        "document-due",
        doc.side === "client"
          ? "Client payment outstanding"
          : "Supplier payment outstanding",
        doc.dueDate < today ? "Overdue" : "Upcoming",
        "Document balance; no active payment terms exist.",
        remaining.toFixed(4),
        "TTC",
        doc.dueDate,
      );
    const position = cash.get(doc.projectId) ?? {
      incoming: new Decimal(0),
      outgoing: new Decimal(0),
      complete: true,
    };
    if (hasBalance && (!comparable || mismatch || doc.totalTtc === null))
      position.complete = false;
    for (const term of terms) {
      const balance = installmentOutstanding(term.scheduled, term.paid);
      if (term.actualFxMissing && !doc.actualFxMissing)
        add(
          { ...doc, id: term.id },
          "term-actual-fx",
          "Missing actual payment FX",
          "Incomplete",
          "Review the term’s payment history and enter actual FX.",
          null,
          null,
          null,
          term.href,
        );
      if (!balance.greaterThan(0)) continue;
      const due = term.dueDate ?? (doc.side === "client" ? doc.dueDate : null);
      if (!due) {
        position.complete = false;
        add(
          { ...doc, id: term.id },
          "term-date",
          "Missing payment due date",
          "Incomplete",
          "This remaining payment cannot be placed in the cash forecast.",
          balance.toFixed(4),
          "TTC",
          null,
          term.href,
          term.currency,
        );
      } else if (due <= end) {
        add(
          { ...doc, id: term.id },
          "term-due",
          doc.side === "client"
            ? "Client payment outstanding"
            : doc.side === "freight"
              ? "Freight payment due"
              : "Supplier payment due",
          due < today ? "Overdue" : "Upcoming",
          "Remaining amount after recorded payments.",
          balance.toFixed(4),
          "TTC",
          due,
          term.href,
          term.currency,
        );
      }
      const converted = reportingAmount({
        originalAmount: balance,
        originalCurrencyCode: term.currency,
        reportingCurrencyCode: doc.reportingCurrency,
        fxRateToReporting: term.fx,
      });
      if (converted === null)
        add(
          { ...doc, id: term.id },
          "term-fx",
          "Missing payment forecast FX",
          "Incomplete",
          "Set expected FX on this term; document FX does not replace it.",
          balance.toFixed(4),
          "TTC",
          due,
          term.href,
          term.currency,
        );
      if (due && due <= end) {
        if (converted === null) position.complete = false;
        else if (doc.side === "client")
          position.incoming = position.incoming.plus(converted);
        else position.outgoing = position.outgoing.plus(converted);
      }
    }
    cash.set(doc.projectId, position);
    // Conservative candidate grouping: same side, party, currency, date and positive invoice amount.
    if (
      doc.side !== "freight" &&
      doc.partyId &&
      doc.date &&
      doc.totalTtc &&
      new Decimal(doc.totalTtc).greaterThan(0)
    ) {
      const key = JSON.stringify([
        doc.side,
        doc.partyId,
        doc.currency,
        doc.date,
        new Decimal(doc.totalTtc).toFixed(4),
      ]);
      const group = duplicates.get(key) ?? [];
      group.push(doc);
      duplicates.set(key, group);
    }
  }
  for (const group of duplicates.values()) {
    if (group.length < 2) continue;
    const sorted = group.toSorted((a, b) => a.id.localeCompare(b.id));
    const first = sorted[0];
    if (first)
      add(
        first,
        "duplicate",
        "Possible duplicate invoice",
        "Review",
        `Same counterparty, date, currency and amount: ${sorted.map((doc) => doc.reference).join(", ")}. Review only; these may be legitimate separate invoices.`,
        first.totalTtc,
        "TTC",
        first.date,
      );
  }
  for (const project of projects) {
    const base: AttentionIssue = {
      key: `profitability:${project.id}`,
      priority: "Review",
      title: "Invoiced markup below Project target",
      detail: `Invoiced markup ${formatRate(project.actualMarkup)}; target ${formatRate(project.targetMarkup)}. Provisional: compares invoiced revenue with recorded economic costs, not matched cost recognition or cash. Partial invoicing can explain this difference.`,
      projectId: project.id,
      projectName: project.name,
      reference: project.name,
      href: `/projects/${project.id}?tab=details`,
      amount: null,
      currency: project.currency,
      basis: null,
      date: null,
    };
    if (
      project.actualMarkup !== null &&
      project.targetMarkup !== null &&
      new Decimal(project.actualMarkup).lessThan(project.targetMarkup)
    )
      issues.push(base);
    const position = cash.get(project.id);
    if (
      position &&
      position.complete &&
      position.outgoing.greaterThan(position.incoming)
    )
      issues.push({
        ...base,
        key: `cash-gap-${horizon}:${project.id}`,
        title: "Scheduled cash-out exceeds cash-in",
        detail: `Overdue plus next ${horizon} days. Excludes starting cash and unscheduled future business; this is not a bank-balance forecast.`,
        amount: position.outgoing.minus(position.incoming).toFixed(4),
        basis: "TTC",
      });
    else if (position && !position.complete)
      issues.push({
        ...base,
        key: `cash-incomplete:${project.id}`,
        priority: "Incomplete",
        title: "Cash outlook incomplete",
        detail:
          "Review missing dates, FX and payment schedule differences before assessing a funding shortfall.",
      });
  }
  return issues.sort(
    (a, b) =>
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) ||
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.key.localeCompare(b.key),
  );
}
