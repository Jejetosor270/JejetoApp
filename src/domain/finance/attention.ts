import Decimal from "decimal.js";
import { cashWindowEnd } from "@/domain/payments/dates";
import { installmentOutstanding } from "@/domain/payments/calculations";
import { cappedCashTerms } from "@/domain/payments/cash-expectations";
import { reportingAmount } from "@/domain/finance/calculations";
import { formatRate } from "@/domain/procurement/presentation";
import type { RefundExpectation } from "@/domain/credits/refund-expectations";

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
  reviewReason?: string | null;
  creditAdjusted?: boolean;
  refundDue?: string | undefined;
  refundExpectations?: readonly RefundExpectation[] | undefined;
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

type CashPosition = {
  incoming: Decimal;
  outgoing: Decimal;
  complete: boolean;
  explained: boolean;
};
type DuplicateGroups = Map<string, AttentionDocument[]>;

function createIssueAdder(issues: AttentionIssue[]) {
  return (
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
}

type AddIssue = ReturnType<typeof createIssueAdder>;

/** Never borrow an Invoice or installment date for a refund. */
export function refundDueIssue(doc: AttentionDocument): AttentionIssue | null {
  if (
    !doc.issued ||
    !doc.creditAdjusted ||
    doc.reviewReason ||
    !new Decimal(doc.refundDue ?? "0").greaterThan(0)
  )
    return null;
  return {
    key: `refund-due-${doc.side}:${doc.id}`,
    priority: "Action needed",
    title:
      doc.side === "client" ? "Client refund due" : "Supplier refund expected",
    detail: doc.refundExpectations?.some((row) => row.dueDate)
      ? "A credit left cash to refund. Review its expected dates and manual FX in Credits & refunds."
      : "A credit left cash to refund. No refund date is scheduled; review Credits & refunds before relying on expected cash.",
    projectId: doc.projectId,
    projectName: doc.projectName,
    reference: doc.reference,
    href: `${doc.href.split("#")[0]}#credits`,
    amount: new Decimal(doc.refundDue ?? "0").toFixed(4),
    currency: doc.currency,
    basis: "TTC",
    date: null,
  };
}

function checkRefunds(
  doc: AttentionDocument,
  today: string,
  end: string,
  issues: AttentionIssue[],
  position: CashPosition,
) {
  const base = refundDueIssue(doc);
  if (!base) return;
  if (!doc.refundExpectations?.length) {
    issues.push(base);
    position.complete = false;
    return;
  }
  for (const row of doc.refundExpectations) {
    const converted =
      row.reportingCurrencyCode &&
      row.reportingCurrencyCode !== doc.reportingCurrency
        ? null
        : reportingAmount({
            originalAmount: row.amount,
            originalCurrencyCode: doc.currency,
            reportingCurrencyCode: doc.reportingCurrency,
            fxRateToReporting: row.expectedFxRate,
          });
    const incomplete = !row.dueDate || converted === null;
    if (incomplete || (row.dueDate && row.dueDate <= end))
      issues.push({
        ...base,
        key: `${base.key}:${row.id}`,
        reference: row.reference
          ? `${doc.reference} · ${row.reference}`
          : doc.reference,
        amount: row.amount,
        date: row.dueDate,
        priority: incomplete
          ? "Incomplete"
          : row.dueDate && row.dueDate < today
            ? "Overdue"
            : "Upcoming",
        detail: !row.dueDate
          ? "Set the expected refund date in Credits & refunds."
          : converted === null
            ? "Review expected refund FX in Credits & refunds."
            : "Expected refund, separate from recorded cash. Open Credits & refunds to record or revise it.",
      });
    if (incomplete) position.complete = false;
    else if (row.dueDate && row.dueDate <= end) {
      if (doc.side === "client")
        position.outgoing = position.outgoing.plus(converted);
      else position.incoming = position.incoming.plus(converted);
    }
  }
}

function checkInvoiceIssuing(
  doc: AttentionDocument,
  today: string,
  end: string,
  add: AddIssue,
) {
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
}

function checkDocumentFx(doc: AttentionDocument, add: AddIssue) {
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
}

function paymentSchedule(doc: AttentionDocument) {
  const terms = doc.terms.filter((term) => !term.cancelled);
  const remaining =
    doc.totalTtc === null
      ? null
      : installmentOutstanding(
          doc.totalTtc,
          doc.creditAdjusted ? Decimal.min(doc.totalTtc, doc.paid) : doc.paid,
        );
  const comparable = terms.every((term) => term.currency === doc.currency);
  const scheduledRemaining = comparable
    ? sum(
        terms.map((term) =>
          installmentOutstanding(term.scheduled, term.paid).toString(),
        ),
      )
    : new Decimal(0);
  const mismatch =
    remaining !== null &&
    comparable &&
    (doc.creditAdjusted || doc.side === "client"
      ? scheduledRemaining.lessThan(remaining)
      : !remaining.equals(scheduledRemaining));
  const hasBalance =
    remaining === null ||
    remaining.greaterThan(0) ||
    (!doc.creditAdjusted &&
      doc.side !== "client" &&
      terms.some((term) =>
        installmentOutstanding(term.scheduled, term.paid).greaterThan(0),
      ));

  return {
    terms,
    remaining,
    comparable,
    scheduledRemaining,
    hasBalance,
    incomplete:
      hasBalance && (!comparable || mismatch || doc.totalTtc === null),
  };
}

type PaymentSchedule = ReturnType<typeof paymentSchedule>;

function checkScheduleInformation(
  doc: AttentionDocument,
  schedule: PaymentSchedule,
  add: AddIssue,
) {
  const {
    terms,
    remaining,
    comparable,
    scheduledRemaining,
    hasBalance,
    incomplete,
  } = schedule;
  if (incomplete)
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
  if (
    doc.side === "client" &&
    !doc.creditAdjusted &&
    comparable &&
    doc.totalTtc !== null
  ) {
    const excess = sum(terms.map((term) => term.scheduled)).minus(doc.totalTtc);
    if (excess.greaterThan(0))
      add(
        doc,
        "schedule-overflow",
        "Review payment schedule",
        "Review",
        "Saved terms exceed the Invoice total. Cash expectations remain capped by the Invoice balance; review the original schedule.",
        excess.toFixed(4),
        "TTC",
      );
  }
  if (
    hasBalance &&
    terms.length === 0 &&
    (doc.side === "client" || !doc.dueDate)
  )
    add(
      doc,
      "missing-date",
      "Missing payment due date",
      "Incomplete",
      "Set a due date and review the payment terms.",
      remaining?.toFixed(4) ?? null,
      "TTC",
    );
}

function checkDocumentDue(
  doc: AttentionDocument,
  schedule: PaymentSchedule,
  today: string,
  end: string,
  add: AddIssue,
) {
  const { remaining, terms } = schedule;
  if (
    doc.side !== "client" &&
    remaining?.greaterThan(0) &&
    terms.length === 0 &&
    doc.dueDate &&
    doc.dueDate <= end
  )
    add(
      doc,
      "document-due",
      "Supplier payment outstanding",
      doc.dueDate < today ? "Overdue" : "Upcoming",
      "Document balance; no active payment terms exist.",
      remaining.toFixed(4),
      "TTC",
      doc.dueDate,
    );
}

function checkTermActualFx(
  doc: AttentionDocument,
  term: AttentionTerm,
  add: AddIssue,
) {
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
}

function checkTermDue(
  doc: AttentionDocument,
  term: AttentionTerm,
  balance: Decimal,
  due: string | null,
  window: { today: string; end: string },
  add: AddIssue,
) {
  const { today, end } = window;
  if (!due) {
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
}

function addTermForecast(
  doc: AttentionDocument,
  term: AttentionTerm,
  balance: Decimal,
  due: string | null,
  end: string,
  position: CashPosition,
  add: AddIssue,
) {
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

function checkPaymentTerms(
  doc: AttentionDocument,
  schedule: PaymentSchedule,
  today: string,
  end: string,
  add: AddIssue,
  position: CashPosition,
) {
  if (schedule.incomplete) position.complete = false;
  const capped =
    schedule.comparable && doc.totalTtc !== null
      ? cappedCashTerms(
          doc.totalTtc,
          doc.creditAdjusted
            ? Decimal.min(doc.totalTtc, doc.paid).toString()
            : doc.paid,
          schedule.terms.map((term) => ({
            source: term,
            amount: term.scheduled,
            paid: term.paid,
            due: term.dueDate,
            cancelled: term.cancelled,
          })),
        ).terms
      : schedule.terms.map((term) => ({
          term: { source: term },
          amount: installmentOutstanding(term.scheduled, term.paid),
        }));
  for (const {
    term: { source: term },
    amount: balance,
  } of capped) {
    checkTermActualFx(doc, term, add);
    if (!balance.greaterThan(0)) continue;
    const due = term.dueDate;
    checkTermDue(doc, term, balance, due, { today, end }, add);
    if (!due) position.complete = false;
    addTermForecast(doc, term, balance, due, end, position, add);
  }
}

function collectDuplicateCandidate(
  doc: AttentionDocument,
  duplicates: DuplicateGroups,
) {
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

function checkDuplicates(duplicates: DuplicateGroups, add: AddIssue) {
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
}

function projectIssueBase(project: AttentionProject): AttentionIssue {
  return {
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
}

function checkProjectMarkup(
  project: AttentionProject,
  base: AttentionIssue,
  issues: AttentionIssue[],
) {
  if (
    project.actualMarkup !== null &&
    project.targetMarkup !== null &&
    new Decimal(project.actualMarkup).lessThan(project.targetMarkup)
  )
    issues.push(base);
}

function checkFundingShortfall(
  position: CashPosition | undefined,
  project: AttentionProject,
  base: AttentionIssue,
  horizon: AttentionHorizon,
  issues: AttentionIssue[],
) {
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
  else if (position && !position.complete && !position.explained)
    issues.push({
      ...base,
      key: `cash-incomplete:${project.id}`,
      priority: "Incomplete",
      title: "Cash outlook incomplete",
      detail:
        "Review missing dates, FX and payment schedule differences before assessing a funding shortfall.",
    });
}

/** Derived reminders only: never creates cash, schedules or financial state. */
export function buildFinancialAttention(
  documents: AttentionDocument[],
  projects: AttentionProject[],
  today: string,
  horizon: AttentionHorizon,
): AttentionIssue[] {
  const end = cashWindowEnd(today, horizon);
  const issues: AttentionIssue[] = [];
  const add = createIssueAdder(issues);
  const cash = new Map<string, CashPosition>();
  const duplicates: DuplicateGroups = new Map();
  for (const doc of documents) {
    checkInvoiceIssuing(doc, today, end, add);
    if (!doc.issued) continue;
    if (doc.reviewReason) {
      add(
        doc,
        "cash-match",
        "Review Billing payment match",
        "Incomplete",
        doc.reviewReason,
      );
      const previous = cash.get(doc.projectId);
      cash.set(doc.projectId, {
        incoming: previous?.incoming ?? new Decimal(0),
        outgoing: previous?.outgoing ?? new Decimal(0),
        complete: false,
        explained: previous?.explained ?? true,
      });
      continue;
    }
    const issueStart = issues.length;
    checkDocumentFx(doc, add);
    const schedule = paymentSchedule(doc);
    checkScheduleInformation(doc, schedule, add);
    checkDocumentDue(doc, schedule, today, end, add);
    const previous = cash.get(doc.projectId);
    const position: CashPosition = {
      incoming: new Decimal(0),
      outgoing: new Decimal(0),
      complete: true,
      explained: true,
    };
    checkRefunds(doc, today, end, issues, position);
    checkPaymentTerms(doc, schedule, today, end, add, position);
    // Omit the aggregate warning only when this incomplete source has a specific
    // actionable issue. An unexplained failure must remain visible.
    if (!position.complete)
      position.explained = issues
        .slice(issueStart)
        .some((issue) =>
          /^(schedule|missing-date|term-date|term-fx|refund-due-(?:supplier|client|freight)):/.test(
            issue.key,
          ),
        );
    if (previous) {
      position.incoming = position.incoming.plus(previous.incoming);
      position.outgoing = position.outgoing.plus(previous.outgoing);
      position.complete &&= previous.complete;
      position.explained &&= previous.explained;
    }
    cash.set(doc.projectId, position);
    collectDuplicateCandidate(doc, duplicates);
  }
  checkDuplicates(duplicates, add);
  for (const project of projects) {
    const base = projectIssueBase(project);
    checkProjectMarkup(project, base, issues);
    checkFundingShortfall(cash.get(project.id), project, base, horizon, issues);
  }
  return issues.sort(
    (a, b) =>
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) ||
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.key.localeCompare(b.key),
  );
}
