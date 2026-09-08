// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { act, useState } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter } from "@/test/dom-form";
import { useDocumentPreview } from "./use-document-preview";
import { DocumentReviewWorkspace } from "./document-review-workspace";
import { intakeOptions, intakeReview } from "@/test/intake-review-fixture";
import { manualBillingReview } from "@/domain/billing/manual-review";
const actions = vi.hoisted(() => ({
  clientProcess: vi.fn(),
  clientSave: vi.fn(),
  supplierProcess: vi.fn(),
  supplierSave: vi.fn(),
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  processClientDocumentAction: actions.clientProcess,
  confirmClientDocumentAction: actions.clientSave,
}));
vi.mock("@/app/(app)/orders/import/actions", () => ({
  processSupplierQuoteAction: actions.supplierProcess,
  confirmSupplierQuoteAction: actions.supplierSave,
  previewSupplierOrderBillingAction: vi.fn(),
}));
vi.mock("@/components/quote-intake/supplier-creation-form", () => ({
  QuoteSupplierCreationForm: () => null,
}));
import { ClientDocumentIntake } from "@/components/billing/client-document-intake";
import { QuoteIntake } from "@/components/quote-intake/quote-intake";
const create = vi.fn(),
  revoke = vi.fn();
let mounted: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.clearAllMocks();
  let index = 0;
  create.mockImplementation(() => `blob:test-${++index}`);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await mounted?.unmount();
  vi.unstubAllGlobals();
});
function Harness() {
  const { preview, select, clear } = useDocumentPreview(1000);
  const [draft, setDraft] = useState("");
  return (
    <>
      <button
        onClick={() =>
          select(new File(["pdf"], "one.pdf", { type: "application/pdf" }))
        }
      >
        PDF
      </button>
      <button
        onClick={() =>
          select(new File(["png"], "two.png", { type: "image/png" }))
        }
      >
        Image
      </button>
      <button
        onClick={() =>
          select(new File(["bad"], "unsafe.html", { type: "text/html" }))
        }
      >
        Unsupported
      </button>
      <button onClick={clear}>Save</button>
      <DocumentReviewWorkspace source={preview}>
        <input
          name="draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </DocumentReviewWorkspace>
    </>
  );
}
it("releases replaced sources, preserves drafts through view changes and clears on save", async () => {
  mounted = await mountForm(<Harness />);
  await enter("draft", "Review notes");
  await clickText("PDF");
  expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
    "blob:test-1",
  );
  await clickText("Document");
  await clickText("Review");
  expect(
    document.querySelector<HTMLInputElement>('[name="draft"]')?.value,
  ).toBe("Review notes");
  const splitter = document.querySelector('[role="separator"]');
  await act(async () => {
    splitter?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(splitter?.getAttribute("aria-valuenow")).toBe("47");
  await clickText("Image");
  expect(revoke).toHaveBeenCalledWith("blob:test-1");
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "blob:test-2",
  );
  await clickText("Save");
  expect(revoke).toHaveBeenCalledWith("blob:test-2");
  expect(document.querySelector("img")).toBeNull();
  expect(
    document.querySelector<HTMLInputElement>('[name="draft"]')?.value,
  ).toBe("Review notes");
});
it("releases preview on unmount and refuses unsupported content", async () => {
  mounted = await mountForm(<Harness />);
  await clickText("Unsupported");
  expect(create).not.toHaveBeenCalled();
  await clickText("PDF");
  await mounted.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:test-1");
});
async function upload() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Missing upload");
  await act(async () => {
    const data = new DataTransfer();
    data.items.add(
      new File(["%PDF-sample"], "sample.pdf", { type: "application/pdf" }),
    );
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() {
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing form");
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
it.each(["client", "supplier"])(
  "keeps %s source through extraction and a failed save, then clears on success",
  async (kind) => {
    if (kind === "client") {
      actions.clientProcess.mockResolvedValue({
        status: "ready",
        message: "",
        review: manualBillingReview(),
      });
      actions.clientSave
        .mockResolvedValueOnce({
          status: "error",
          message: "Correct the reference",
        })
        .mockResolvedValueOnce({
          status: "success",
          message: "Saved",
          recordId: "saved",
        });
      mounted = await mountForm(
        <ClientDocumentIntake
          options={{
            clients: [],
            projects: [],
            orders: [],
            currencies: [],
            installments: [],
          }}
        />,
      );
    } else {
      actions.supplierProcess.mockResolvedValue({
        status: "ready",
        message: "",
        review: { ...intakeReview(), requestId: "request" },
      });
      actions.supplierSave
        .mockResolvedValueOnce({
          status: "error",
          message: "Correct the reference",
        })
        .mockResolvedValueOnce({
          status: "success",
          message: "Saved",
          orderId: "saved",
        });
      mounted = await mountForm(<QuoteIntake options={intakeOptions()} />);
    }
    await upload();
    await submit();
    expect(document.querySelector("iframe")).not.toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await submit();
    expect(document.querySelector("iframe")).not.toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    await submit();
    expect(document.querySelector("iframe")).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:test-1");
  },
);
