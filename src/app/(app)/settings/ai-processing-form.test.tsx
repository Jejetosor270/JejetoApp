// @vitest-environment happy-dom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { enter, mountForm } from "@/test/dom-form";
const save = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ updateAiProcessingSettingsAction: save }));
import { AiProcessingForm } from "./ai-processing-form";

it("preserves independent selections after a failed save and resubmits them", async () => {
  save
    .mockResolvedValueOnce({ status: "error", formError: "Unable to save." })
    .mockResolvedValueOnce({ status: "success", message: "Saved" });
  const view = await mountForm(
    <AiProcessingForm
      models={{
        quoteExtractionModel: "gpt-5.6-luna",
        itemExtractionModel: "gpt-5.6-luna",
        clientDocumentExtractionModel: "gpt-5.6-luna",
      }}
    />,
  );
  try {
    await enter("quoteExtractionModel", "gpt-5.6-terra");
    await enter("clientDocumentExtractionModel", "gpt-5.6-sol");
    const form = view.container.querySelector("form");
    if (!form) throw new Error("Missing settings form");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(view.container.textContent).toContain("Unable to save.");
    expect(Object.fromEntries(new FormData(form))).toEqual({
      quoteExtractionModel: "gpt-5.6-terra",
      itemExtractionModel: "gpt-5.6-luna",
      clientDocumentExtractionModel: "gpt-5.6-sol",
    });
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain("Saved");
  } finally {
    await view.unmount();
  }
});
