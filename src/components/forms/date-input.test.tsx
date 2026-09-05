// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";
import { DateInput } from "./date-input";
import { control, enter, mountForm } from "@/test/dom-form";

describe("shared date entry", () => {
  it("accepts European keyboard dates and submits a date-only ISO value", async () => {
    const view = await mountForm(
      <form>
        <DateInput name="date" defaultValue="2026-03-29" />
      </form>,
    );
    expect(control("date").value).toBe("29/03/2026");
    await enter("date", "25/10/2026");
    expect(new FormData(document.querySelector("form")!).get("date")).toBe(
      "2026-10-25",
    );
    await enter("date", "31/02/2026");
    expect(document.querySelector("form")?.checkValidity()).toBe(false);
    await view.unmount();
  });
  it("opens a calendar and preserves the selected day", async () => {
    const view = await mountForm(
      <form>
        <DateInput name="date" defaultValue="2026-03-29" />
      </form>,
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Choose date"]')
        ?.click(),
    );
    expect(document.querySelector('[aria-label="Calendar"]')).not.toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[data-date="2026-03-30"]')
        ?.click(),
    );
    expect(control("date").value).toBe("30/03/2026");
    expect(new FormData(document.querySelector("form")!).get("date")).toBe(
      "2026-03-30",
    );
    await view.unmount();
  });
});
