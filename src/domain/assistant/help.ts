export const assistantHelpTopics = [
  "partial_payment",
  "mark_paid",
  "billing_allocation",
  "order_pricing",
  "vat_fx",
  "project_financials",
  "credits_refunds",
  "documents_import",
] as const;

export type AssistantHelpTopic = (typeof assistantHelpTopics)[number];

export interface AssistantHelpEntry {
  title: string;
  paragraphs: string[];
  steps?: string[];
  links: { label: string; href: string }[];
}

// Curated guidance follows the existing editors; model output cannot supply steps,
// links, permissions or financial rules. Revisit alongside workflow changes.
const helpEntries: Record<AssistantHelpTopic, AssistantHelpEntry> = {
  partial_payment: {
    title: "Partial payments",
    paragraphs: [
      "Supplier payments are money out. Client receipts are money in. Both record actual cash; changing a due date or payment term does not record cash.",
    ],
    steps: [
      "Supplier: open the Order in Purchasing, then Related → Payment terms. On the term, choose More actions → Record partial payment.",
      "Client: open the Invoice in Billing. If it is Draft or To be invoiced, change its status to Invoiced and save first. Then open Related → Payment terms → More actions → Record partial payment.",
      "Enter the actual amount and payment date, plus actual FX when the currency differs from the Project currency. Save the payment or receipt; the remaining balance and status update automatically.",
    ],
    links: [
      { label: "Open Purchasing", href: "/orders" },
      { label: "Open Billing", href: "/billing" },
    ],
  },
  mark_paid: {
    title: "Mark paid",
    paragraphs: [
      "Mark paid records the full remaining balance as actual cash. It preserves earlier partial payments; it is not a display-only status change.",
      "The payment-term shortcut uses today's payment date and can save immediately. If actual FX or another required value is missing, it opens a drawer. Use Record partial payment to enter an amount and date explicitly, or correct an existing transaction through Payment history.",
    ],
    steps: [
      "Open the Order or Billing Invoice, then Related → Payment terms. Review the remaining balance before choosing Mark paid on a term.",
      "A Draft or To be invoiced Client Invoice must first be saved as Invoiced. Issuing the Invoice alone does not record a receipt. Quotes are plans, not issued Invoices.",
      "After recording, review Payment history. If the amount was smaller than the remaining balance, use More actions → Record partial payment instead.",
    ],
    links: [
      { label: "Open Purchasing", href: "/orders" },
      { label: "Open Billing", href: "/billing" },
    ],
  },
  billing_allocation: {
    title: "Billing allocations",
    paragraphs: [
      "An allocation attributes Billing HT to an Order in the same Project. It does not change the Order's selling price or record a payment. Freight and Other/services are included portions of the allocation, not additional amounts.",
    ],
    steps: [
      "Open Billing → the document → Related → Linked Orders, then Add allocation. From an Order, use Related → Linked Billing and choose the Project and Billing document first.",
      "Choose the Order. A new allocation proposes its Sell HT in Billing currency, capped at available Billing HT. Missing manual FX leaves the proposal blank.",
      "Review Allocation HT, its percentages and included Freight/Other amounts. Existing allocations are not replaced automatically. Choose Save allocation when correct.",
    ],
    links: [
      { label: "Open Billing", href: "/billing" },
      { label: "Open Purchasing", href: "/orders" },
    ],
  },
  order_pricing: {
    title: "Order pricing",
    paragraphs: [
      "Project markup uses the Project's Product, Freight and Other Cost defaults. Order markup uses explicit rates for that Order. Direct selling price uses the entered package selling price, with separately recharged freight added once.",
      "Markup is profit divided by cost; margin is profit divided by selling revenue. They are different percentages. Recoverable input VAT is not economic cost; non-deductible input VAT is.",
    ],
    steps: [
      "Open the Order in Purchasing and its editor. Review the purchase, freight, customs and miscellaneous amounts under Costs, FX & VAT.",
      "Under Commercial pricing, choose Pricing method and review the resulting Sell HT and freight treatment before saving.",
      "Review payment terms separately after a price change. Existing scheduled amounts are never silently rewritten.",
    ],
    links: [{ label: "Open Purchasing", href: "/orders" }],
  },
  vat_fx: {
    title: "VAT & FX",
    paragraphs: [
      "Purchase VAT and output VAT are independent. Deductible input VAT does not increase economic cost; the non-deductible portion does. Output VAT is not revenue or profit. VAT treatments and recoverability require employee review, not an AI or country-based assumption.",
      "Purchase VAT can propose Product purchase HT until you edit its taxable base; Use purchase HT resumes that proposal. Output VAT defaults to total selling HT unless a manual base is set. Explicit saved bases, including zero, remain meaningful.",
      "Manual FX means one transaction-currency unit equals the entered amount in Project currency. Order/Billing FX, expected payment FX and actual cash FX are independent. Missing required FX makes reporting incomplete; it never means zero.",
    ],
    steps: [
      "Open the Order editor → Costs, FX & VAT, or the Billing editor, to review its original currency, VAT fields and manual FX.",
      "For an actual payment or receipt, review its own date and actual FX in Payment history. Do not substitute a document or expected rate without reviewing it.",
    ],
    links: [
      { label: "Open Purchasing", href: "/orders" },
      { label: "Open Billing", href: "/billing" },
    ],
  },
  project_financials: {
    title: "Project financials",
    paragraphs: [
      "Costs & profit compares agreed Order selling prices with recorded economic costs, including separate Project freight and non-deductible VAT once. Pricing profit is not final or earned Project profit; markup uses total profit divided by total cost.",
      "Client Billing separates issued Invoice HT from To be invoiced amounts. Order coverage HT is total issued Client Invoice HT after credits minus Order selling HT. Allocations do not limit this figure; a negative value means issued Billing is below Order sell.",
      "Cash shows actual Client receipts less Supplier/freight payments, net of actual refunds. To collect and To pay are outstanding commitments, not recorded cash. Net cash is tracked Project cash, not a bank balance.",
      "Budget estimate compares the full Billing plan with the complete approved budget. Missing budgets or required FX stay incomplete. VAT and Freight are separate expandable breakdowns; this is management reporting, not a tax return.",
    ],
    steps: [
      "Open Projects → the Project → Details. Use Costs & profit, Client Billing and Cash for the headline position.",
      "Click a monetary figure to inspect its source records. Expand Budget estimate, VAT or Freight only when you need the breakdown.",
      "Use Related to inspect linked Orders, Billing and payment terms without treating plans or allocations as actual cash.",
    ],
    links: [{ label: "Open Projects", href: "/projects" }],
  },
  credits_refunds: {
    title: "Credits & refunds",
    paragraphs: [
      "A credit reduces a commercial balance; it does not move cash. Supplier credits reduce product purchase cost and eligible input VAT while preserving agreed Client selling prices. Client credits reduce Invoice HT/VAT and only the linked Order allocations explicitly selected.",
      "A credit on a paid document can create Refund due. An actual Supplier refund is money in; an actual Client refund is money out. Refunds are recorded separately with their actual date and independent FX.",
    ],
    steps: [
      "Open an active Supplier Order or issued Client Invoice → Related → Credits & refunds → Record credit. Review the amount, VAT and reason; for Client credits, explicitly choose any credited Order allocations.",
      "If a refund is due and cash has actually moved, use Record actual refund. A credit alone must not be entered as a payment or receipt.",
      "For corrections, correct active refunds before cancelling their credit. Original documents, payment terms and cash history remain preserved.",
    ],
    links: [
      { label: "Open Purchasing", href: "/orders" },
      { label: "Open Billing", href: "/billing" },
    ],
  },
  documents_import: {
    title: "Document imports",
    paragraphs: [
      "AI proposes data for employee review; it never silently saves an Order, creates a Supplier or chooses authoritative FX/VAT rules. Uploads are temporary: reviewed structured records and import metadata remain, not the source files or raw AI output.",
    ],
    steps: [
      "Supplier: Purchasing → New Order → Import Supplier document. Select the Project before uploading a PDF, JPG/JPEG or PNG, up to 4 MiB.",
      "Client: Billing → New Billing → Import Client document. Upload a PDF up to 4 MiB, then confirm the Client and Project during review. Enter manually is also available without AI.",
      "Review references, descriptions, amounts, freight inclusion, VAT, currency, manual FX and any proposed payment terms. Confirm an existing-record update explicitly; missing extracted fields must not replace saved values.",
      "Save only after review. The temporary browser preview is cleared when you save or close; this is not a document repository.",
    ],
    links: [
      { label: "Open Purchasing", href: "/orders" },
      { label: "Open Billing", href: "/billing" },
    ],
  },
};

export function getAssistantHelp(
  topic: AssistantHelpTopic,
  role: "ADMIN" | "MANAGER" | "USER",
): AssistantHelpEntry {
  const entry = helpEntries[topic];
  const permissionNote =
    role === "USER"
      ? "You can view these records. Ask an ADMIN or MANAGER to make changes; JejetoBot is read-only."
      : "Operational changes require an ADMIN or MANAGER in the record's editor. JejetoBot is read-only and cannot save changes.";
  return {
    title: entry.title,
    paragraphs: [...entry.paragraphs, permissionNote],
    ...(entry.steps ? { steps: [...entry.steps] } : {}),
    links: entry.links.map((link) => ({ ...link })),
  };
}
