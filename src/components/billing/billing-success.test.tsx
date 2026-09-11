vi.mock("@/app/(app)/billing/status-actions", () => ({
  changeBillingStatusAction: vi.fn(),
}));
// @vitest-environment happy-dom
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { mountForm } from "@/test/dom-form";
const result = vi.hoisted(() => ({
  status: "success",
  recordId: "created-record",
  message: "Saved",
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  confirmClientDocumentAction: vi.fn(),
  processClientDocumentAction: vi.fn(),
}));
vi.mock("@/components/forms/use-persistent-action-state", () => ({
  usePersistentActionState: () => ({
    state: result,
    onSubmit: vi.fn(),
    pending: false,
  }),
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
import { ClientDocumentReview } from "./client-document-intake";

it.each(["created-record", "related-existing-record"])(
  "uses the returned Billing record ID: %s",
  async (recordId) => {
    result.recordId = recordId;
    const review = {
      proposal: { totalHt: "100", totalTtc: "100", installments: [] },
    } as unknown as ComponentProps<typeof ClientDocumentReview>["review"];
    const view = await mountForm(
      <ClientDocumentReview
        options={{
          clients: [],
          projects: [],
          orders: [],
          currencies: [],
          installments: [],
        }}
        review={review}
      />,
    );
    expect(document.querySelector("a")?.getAttribute("href")).toBe(
      `/billing/${recordId}`,
    );
    expect(document.querySelector("a")?.textContent).toBe("Open Billing");
    await view.unmount();
  },
);
