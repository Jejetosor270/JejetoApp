// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";
const change = vi.hoisted(() => vi.fn());
vi.mock("./connection-actions", () => ({ manageErpConnectionAction: change }));
import { ConnectionPanel } from "./connection-panel";

const token = {
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-10-31T10:00:00Z",
  expiresAt: "2099-11-30T10:00:00Z",
  revokedAt: null,
};
const endpoint = "https://erp.example.test/api/mcp";

describe("connection Settings panel", () => {
  beforeEach(() => {
    change.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires consent and preserves it after a rejected request", async () => {
    change.mockResolvedValue({ error: "Please retry." });
    const view = await mountForm(
      <ConnectionPanel
        endpoint={endpoint}
        initialStatus={{ enabled: true, token: null }}
      />,
    );
    try {
      const checkbox = view.container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      const button = view.container.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      expect(button?.disabled).toBe(true);
      await act(async () => checkbox?.click());
      await act(async () =>
        view.container
          .querySelector("form")
          ?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      expect(change).toHaveBeenCalledWith({
        action: "create",
        confirmed: true,
      });
      expect(checkbox?.checked).toBe(true);
      expect(view.container.textContent).toContain("Please retry.");
    } finally {
      await view.unmount();
    }
  });

  it("masks a newly issued key, never persists it, and lets the user dismiss it", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem");
    change.mockResolvedValue({
      secret: "fixture-access-key",
      status: { enabled: true, token },
    });
    const view = await mountForm(
      <ConnectionPanel
        endpoint={endpoint}
        initialStatus={{ enabled: true, token: null }}
      />,
    );
    try {
      await act(async () =>
        view.container
          .querySelector<HTMLInputElement>('input[type="checkbox"]')
          ?.click(),
      );
      await act(async () =>
        view.container
          .querySelector("form")
          ?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      expect(
        view.container.querySelector<HTMLInputElement>('input[type="password"]')
          ?.value,
      ).toBe("fixture-access-key");
      expect(store).not.toHaveBeenCalled();
      await clickText("Dismiss key");
      expect(view.container.querySelector('input[type="password"]')).toBeNull();
      expect(view.container.textContent).not.toContain("fixture-access-key");
    } finally {
      await view.unmount();
    }
  });

  it("requires a separate confirmation to revoke and retains the connection on failure", async () => {
    change
      .mockResolvedValueOnce({ error: "Please retry." })
      .mockResolvedValueOnce({
        status: {
          enabled: true,
          token: { ...token, revokedAt: "2026-11-01T10:00:00Z" },
        },
      });
    const view = await mountForm(
      <ConnectionPanel
        endpoint={endpoint}
        initialStatus={{ enabled: true, token }}
      />,
    );
    try {
      await clickText("Revoke access");
      expect(change).not.toHaveBeenCalled();
      await clickText("Confirm revoke");
      expect(view.container.textContent).toContain("Access enabled");
      await clickText("Confirm revoke");
      expect(change).toHaveBeenLastCalledWith({
        action: "revoke",
        tokenId: token.id,
        confirmed: true,
      });
      expect(view.container.textContent).toContain("No active key");
    } finally {
      await view.unmount();
    }
  });
});
