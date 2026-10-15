// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText } from "@/test/dom-form";
import { manualBillingReview } from "@/domain/billing/manual-review";
import { ClientDocumentReview } from "./client-document-intake";

vi.mock("@/app/(app)/billing/actions", () => ({
  confirmClientDocumentAction: vi.fn(),
  processClientDocumentAction: vi.fn(),
}));
vi.mock("@/app/(app)/billing/status-actions", () => ({
  changeBillingStatusAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => view?.unmount());
const options: ComponentProps<typeof ClientDocumentReview>["options"] = {
  clients: [{ id: "client", displayName: "Client" }],
  projects: [
    {
      id: "project",
      clientId: "client",
      name: "Project",
      code: "P1",
      reportingCurrencyCode: "EUR",
    },
  ],
  orders: [],
  currencies: [{ code: "EUR", name: "Euro" }],
  installments: [
    {
      id: "quote-term",
      billingDocument: {
        clientId: "client",
        projectId: "project",
        reference: "Q1",
      },
      currencyCode: "EUR",
      dueDate: "2026-12-04",
      label: "Quote balance",
      scheduledAmount: "100",
    },
  ],
};
const review = () => {
  const result = manualBillingReview();
  result.clientSuggestionId = "client";
  result.projectSuggestionId = "project";
  result.proposal.dueDate = "2026-12-04";
  result.proposal.totalTtc = "100";
  return result;
};
const fields = () => new FormData(document.querySelector("form") ?? undefined);

it("has one payment due input, owned by the default term, and context-labelled document dates", async () => {
  view = await mountForm(
    <ClientDocumentReview options={options} review={review()} />,
  );
  expect(document.querySelectorAll('[name="dueDate"]')).toHaveLength(1);
  expect(
    document.querySelector('[name="dueDate"]')?.closest("section")?.textContent,
  ).toContain("Payment terms");
  expect(fields().get("dueDate")).toBe("2026-12-04");
  await enter("workflowStatus", "TO_BE_INVOICED");
  expect(document.body.textContent).toContain("Planned invoice date");
  await enter("documentType", "QUOTE");
  expect(document.body.textContent).toContain("Quote date");
  expect(document.body.textContent).not.toContain("Planned invoice date");
});

it("transfers the initial due date to the first explicit term without imposing it on later terms", async () => {
  view = await mountForm(
    <ClientDocumentReview options={options} review={review()} />,
  );
  await clickText("Add payment term");
  expect(document.querySelector('[name="dueDate"]')).toBeNull();
  let terms = JSON.parse(String(fields().get("installments")));
  expect(terms).toEqual([
    expect.objectContaining({
      dueDate: "2026-12-04",
      basis: "PERCENTAGE",
      percentageRate: "1.000000",
    }),
  ]);
  await clickText("Add payment term");
  terms = JSON.parse(String(fields().get("installments")));
  expect(terms.map((term: { dueDate: string }) => term.dueDate)).toEqual([
    "2026-12-04",
    "",
  ]);
});

it("keeps confirmed split dates independent from the extracted overall due date", async () => {
  const proposal = review();
  proposal.proposal.installments = ["2026-11-01", "2026-12-01"].map(
    (dueDate) => ({
      basis: "PERCENTAGE",
      label: "Half",
      dueDate,
      percentageRate: "0.5",
      fixedAmount: null,
      timingDescription: null,
    }),
  );
  view = await mountForm(
    <ClientDocumentReview options={options} review={proposal} />,
  );
  expect(document.querySelector('[name="dueDate"]')).toBeNull();
  const terms = JSON.parse(String(fields().get("installments")));
  expect(terms.map((term: { dueDate: string }) => term.dueDate)).toEqual([
    "2026-11-01",
    "2026-12-01",
  ]);
});

it.each(["", "31/12/2026"])(
  "retains the latest term date %s when returning to a simple payment",
  async (nextDate) => {
    view = await mountForm(
      <ClientDocumentReview options={options} review={review()} />,
    );
    await clickText("Add payment term");
    const dateInputs = document.querySelectorAll<HTMLInputElement>(
      'input[placeholder="DD/MM/YYYY"]',
    );
    const termDate = dateInputs[1];
    expect(termDate).toBeDefined();
    await act(async () => {
      if (!termDate) return;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(termDate, nextDate);
      termDate.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText("Remove");
    expect(fields().get("dueDate")).toBe(nextDate ? "2026-12-31" : "");
  },
);

it("proposes the extracted overall due date for review on a single undated term", async () => {
  const proposal = review();
  proposal.proposal.installments = [
    {
      basis: "PERCENTAGE",
      label: "Balance",
      dueDate: null,
      percentageRate: "1",
      fixedAmount: null,
      timingDescription: null,
    },
  ];
  view = await mountForm(
    <ClientDocumentReview options={options} review={proposal} />,
  );
  expect(document.querySelector('[name="dueDate"]')).toBeNull();
  expect(JSON.parse(String(fields().get("installments")))[0].dueDate).toBe(
    "2026-12-04",
  );
});

it("uses the selected Quote term without an extra invoice due date or duplicate terms", async () => {
  view = await mountForm(
    <ClientDocumentReview options={options} review={review()} />,
  );
  const match = [...document.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.value === "quote-term"),
  );
  expect(match).toBeDefined();
  await act(async () => {
    if (!match) return;
    match.value = "quote-term";
    match.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(document.querySelector('[name="dueDate"]')).toBeNull();
  expect(JSON.parse(String(fields().get("installments")))).toEqual([]);
  expect(fields().get("matchedInstallmentId")).toBe("quote-term");
});
