import "server-only";
import { businessToday } from "@/domain/payments/dates";
import { dashboardHistoryRange } from "@/domain/finance/reports-dashboard";
import { cashDelayScenario } from "@/domain/reporting/forecast-scenario";
import {
  reportExportSchema,
  type ReportExportOptions,
} from "@/domain/reporting/export-options";
import { reportCsv, type ReportCsvRow } from "@/domain/reporting/report-csv";
import { getPortfolioReportingSnapshot } from "./reports";
import {
  getActualCashReport,
  getGlobalVatReport,
  getGlobalFreightReport,
} from "./global-reports";

function actualRange(options: ReportExportOptions, today: string) {
  return options.dateFrom && options.dateTo
    ? { start: options.dateFrom, end: options.dateTo }
    : dashboardHistoryRange(
        today,
        options.trendMonths === "3" ? 3 : options.trendMonths === "12" ? 12 : 6,
      );
}

export async function reportingCsv(input: unknown) {
  const options = reportExportSchema.parse(input);
  const today = businessToday();
  const range = actualRange(options, today);
  const filters = {
    projectId: options.projectId,
    clientId: options.clientId,
    supplierId: options.supplierId,
    projectStatus: options.projectStatus,
  };
  const rows: ReportCsvRow[] = [];
  const add = (
    type: string,
    metric: string,
    amount: string | null,
    currency: string,
    context: Partial<ReportCsvRow> = {},
  ) => rows.push({ type, metric, amount, currency, ...context });
  if (options.dataset === "transactions") {
    const report = await getActualCashReport({
      ...filters,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      direction: options.direction,
    });
    for (const row of report.rows) {
      const context = {
        start: options.dateFrom ?? "",
        end: options.dateTo ?? "",
        date: row.date,
        project: row.projectName,
        reference: row.reference ?? row.billingOrOrderReference,
        source:
          row.href ??
          (row.direction === "CLIENT_RECEIPT"
            ? `/receipts/${row.id}`
            : `/payments/${row.id}`),
        notes: `${row.direction}; ${row.partyName}; ${row.billingOrOrderReference}`,
      };
      add("ACTUAL", "Original cash TTC", row.amount, row.currencyCode, context);
      add(
        "ACTUAL",
        "Project cash TTC",
        row.projectReportingAmount,
        row.projectReportingCurrencyCode,
        context,
      );
    }
    for (const [metric, amount] of [
      ["Cash in TTC", report.totals.cashIn],
      ["Cash out TTC", report.totals.cashOut],
      ["Net movement TTC", report.totals.net],
    ]) {
      add(
        "COMPANY_TOTAL",
        metric ?? "",
        report.complete ? (amount ?? null) : null,
        report.companyCurrencyCode,
        {
          start: options.dateFrom ?? "",
          end: options.dateTo ?? "",
          notes: `${report.excludedProjectCount} foreign-currency Projects excluded; ${report.incompleteIds.length} missing FX records.`,
        },
      );
    }
  } else if (options.dataset === "vat") {
    const report = await getGlobalVatReport(filters);
    for (const row of report.rows) {
      const context = {
        project: row.name,
        source: `/projects/${row.id}`,
        notes: options.supplierId
          ? "Full Project VAT for Projects using Supplier; not Supplier-attributed."
          : "Management VAT position; not a tax return.",
      };
      add(
        "PROJECT",
        "Output VAT",
        row.position.outputVat,
        row.reportingCurrencyCode,
        context,
      );
      add(
        "PROJECT",
        "Deductible input VAT",
        row.position.deductibleInputVat,
        row.reportingCurrencyCode,
        context,
      );
      add(
        "PROJECT",
        "Net VAT",
        row.position.netVat,
        row.reportingCurrencyCode,
        {
          ...context,
          notes: `${context.notes} Positive: payable; negative: credit.`,
        },
      );
    }
    for (const [metric, value] of [
      ["Output VAT", report.position.outputVat],
      ["Deductible input VAT", report.position.deductibleInputVat],
      ["Net VAT", report.position.netVat],
    ] as const)
      add(
        "COMPANY_TOTAL",
        metric,
        report.complete ? value : null,
        report.companyCurrencyCode,
        {
          notes: `${report.excludedProjectCount} foreign-currency Projects excluded. Positive net VAT: payable; negative: credit.`,
        },
      );
  } else if (options.dataset === "freight") {
    const report = await getGlobalFreightReport(filters);
    for (const row of report.rows) {
      const context = {
        project: row.name,
        source: `/projects/${row.id}`,
        notes: options.supplierId
          ? "Full Project freight for Projects using Supplier; not Supplier-attributed."
          : "Economic freight cost includes non-deductible VAT. Recovery is a target, not cash.",
      };
      for (const [metric, key] of [
        ["Expected purchase HT", "expectedProductPurchaseCostHt"],
        ["Freight allowance HT", "expectedFreightAllowanceHt"],
        ["Economic freight cost", "actualCostHt"],
        ["Recovery target HT", "recoveryTargetHt"],
        ["Freight profit", "freightGrossProfitHt"],
        ["Freight headroom", "headroomHt"],
      ] as const)
        add(
          "PROJECT",
          metric,
          row.reconciliation[key],
          row.reportingCurrencyCode,
          context,
        );
      add(
        "PROJECT",
        "Freight estimate rate",
        row.reconciliation.freightEstimateRate,
        "fraction",
        context,
      );
    }
    for (const [metric, key] of [
      ["Freight allowance HT", "expectedFreightAllowanceHt"],
      ["Economic freight cost", "actualCostHt"],
      ["Recovery target HT", "recoveryTargetHt"],
      ["Freight profit", "freightGrossProfitHt"],
      ["Freight headroom", "headroomHt"],
    ] as const)
      add(
        "COMPANY_TOTAL",
        metric,
        report.complete ? report.totals[key] : null,
        report.companyCurrencyCode,
        {
          notes: `${report.excludedProjectCount} foreign-currency Projects excluded. Full Project freight; recovery is a target, not cash.`,
        },
      );
  } else {
    const report = await getPortfolioReportingSnapshot(filters, {
      ...range,
      horizon: options.horizon,
    });
    const currency = report.companyCurrencyCode;
    const scopeNote = options.supplierId
      ? "Supplier costs, payments and refunds only; Client attribution excluded."
      : "Comparable company-currency Projects only.";
    if (options.dataset === "summary") {
      const actual = report.cashFlow.totals;
      add(
        "ACTUAL",
        "Cash received TTC",
        actual.actualComplete ? actual.actualIn : null,
        currency,
        { ...range, notes: scopeNote },
      );
      add(
        "ACTUAL",
        "Cash paid TTC",
        actual.actualComplete ? actual.actualOut : null,
        currency,
        { ...range, notes: scopeNote },
      );
      add(
        "ACTUAL",
        "Net movement TTC",
        actual.actualComplete ? actual.actualNet : null,
        currency,
        { ...range, notes: "Tracked movement, not a bank balance." },
      );
      add(
        "CURRENT_PRICING",
        "Economic cost",
        report.pricing?.cost.value ?? null,
        currency,
        { notes: scopeNote },
      );
      add(
        "CURRENT_PRICING",
        "Order sell HT",
        report.pricing?.sell.value ?? null,
        currency,
      );
      add(
        "CURRENT_PRICING",
        "Pricing profit",
        report.pricing?.profit.value ?? null,
        currency,
        {
          notes:
            "Agreed Order sell less recorded economic cost; not earned/final profit.",
        },
      );
      add(
        "CURRENT_PRICING",
        "Markup rate",
        report.pricing?.markupRate ?? null,
        "fraction",
        {
          status:
            report.pricing?.cost.value === "0.0000"
              ? "NOT_APPLICABLE"
              : undefined,
        },
      );
    }
    if (options.dataset === "trend") {
      for (const row of report.cashFlow.rows) {
        const context = { ...range, date: row.month, notes: scopeNote };
        add(
          "ACTUAL",
          "Cash received TTC",
          row.actualComplete ? row.actualIn : null,
          currency,
          context,
        );
        add(
          "ACTUAL",
          "Cash paid TTC",
          row.actualComplete ? row.actualOut : null,
          currency,
          context,
        );
        add(
          "ACTUAL",
          "Net movement TTC",
          row.actualComplete ? row.actualNet : null,
          currency,
          context,
        );
      }
    }
    if (options.dataset === "projects") {
      for (const row of report.projects) {
        const context = {
          project: row.name,
          reference: row.code,
          source: `/projects/${row.id}`,
          notes: `${scopeNote} Project amounts remain in their own currency.`,
        };
        add(
          "CURRENT_PRICING",
          "Economic cost",
          row.pricing?.cost.value ?? null,
          row.reportingCurrencyCode,
          context,
        );
        add(
          "CURRENT_PRICING",
          "Order sell HT",
          row.pricing?.sell.value ?? null,
          row.reportingCurrencyCode,
          context,
        );
        add(
          "CURRENT_PRICING",
          "Pricing profit",
          row.pricing?.profit.value ?? null,
          row.reportingCurrencyCode,
          context,
        );
        add(
          "CURRENT_PRICING",
          "Markup rate",
          row.pricing?.markupRate ?? null,
          "fraction",
          {
            ...context,
            status:
              row.pricing?.cost.value === "0.0000"
                ? "NOT_APPLICABLE"
                : undefined,
          },
        );
        add(
          "COVERAGE",
          "Issued Invoice less Order sell HT",
          options.supplierId || !row.fundingCoverage.complete
            ? null
            : row.fundingCoverage.fundingCoverageHt,
          row.reportingCurrencyCode,
          {
            ...context,
            status: options.supplierId ? "NOT_APPLICABLE" : undefined,
          },
        );
      }
    }
    if (["summary", "forecast", "obligations"].includes(options.dataset)) {
      const outlook = report.cashFlow.outlook;
      if (!outlook) throw new Error("Forecast unavailable");
      const selectedRange =
        options.dateFrom && options.dateTo
          ? { start: options.dateFrom, end: options.dateTo }
          : undefined;
      const { baseline, scenario, impact } = cashDelayScenario(
        outlook,
        currency,
        options.horizon,
        options.cashDelay,
        selectedRange,
      );
      const context = {
        start: baseline.start,
        end: baseline.end,
        notes: `${scopeNote} Plans excluded. Overdue and undated balances not assigned dates. ${baseline.reviewEntries.length} source gaps; ${baseline.plannedIssues} planned timing/FX issues.`,
      };
      if (options.dataset !== "obligations") {
        add("FORECAST", "Scheduled net TTC", baseline.net, currency, context);
        add("SCENARIO", "Scenario net TTC", scenario.net, currency, {
          ...context,
          notes: `${context.notes} Future cash-in delayed ${options.cashDelay} days; no source changes.`,
        });
        add("SCENARIO", "Timing impact TTC", impact, currency, context);
        add(
          "PLANNED_ONLY",
          "Planned receipts TTC",
          baseline.planned,
          currency,
          context,
        );
      }
      if (options.dataset === "forecast") {
        for (const [type, value] of [
          ["SCHEDULED", baseline],
          ["SCENARIO", scenario],
        ] as const)
          for (const row of value.chart.rows) {
            const month = {
              ...context,
              date: row.month,
              status:
                row.net === null
                  ? "INCOMPLETE"
                  : value.reviewEntries.length
                    ? "PARTIAL_SCHEDULE"
                    : undefined,
            };
            add(type, "Cash in TTC", row.incoming, currency, month);
            add(type, "Cash out TTC", row.outgoing, currency, month);
            add(type, "Net TTC", row.net, currency, month);
          }
      }
      if (options.dataset === "obligations")
        for (const entry of outlook.entries) {
          const inRange =
            entry.due &&
            entry.due >= baseline.start &&
            entry.due <= baseline.end;
          const review =
            !entry.due ||
            entry.due < today ||
            entry.amount === null ||
            entry.reviewReason;
          if (!inRange && !review) continue;
          add(
            entry.kind === "planned" ? "PLANNED_ONLY" : "SCHEDULED",
            entry.kind === "payment" ? "Cash out TTC" : "Cash in TTC",
            entry.amount,
            currency,
            {
              ...context,
              date: entry.due,
              reference: entry.source?.label,
              source: entry.source?.href,
              status:
                entry.amount === null
                  ? "INCOMPLETE"
                  : review
                    ? "REVIEW"
                    : "COMPLETE",
              notes:
                entry.reviewReason ??
                (!entry.due
                  ? "Undated or unscheduled"
                  : entry.due < today
                    ? "Overdue; original date retained"
                    : "Original due date; not scenario-adjusted"),
            },
          );
        }
    }
    if (options.dataset !== "projects")
      for (const project of report.excludedCurrencyProjects)
        add(
          "EXCLUDED",
          "Company conversion unavailable",
          null,
          project.reportingCurrencyCode,
          {
            project: project.name,
            source: `/projects/${project.id}`,
            status: "EXCLUDED_CURRENCY",
          },
        );
  }
  if (!rows.length)
    add("EMPTY", "No matching records", null, "", { status: "EMPTY" });
  return reportCsv(rows, options, today, new Date().toISOString());
}
