import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createErpConnectionRequestGuard,
  ErpConnectionLimitError,
} from "./request-guard";

describe("ERP connection per-instance limits", () => {
  it("allows thirty requests per minute and expires old attempts", async () => {
    let time = 1_000;
    const guard = createErpConnectionRequestGuard(() => time);
    const work = vi.fn().mockResolvedValue("read");
    for (let index = 0; index < 30; index += 1) await guard("owner", work);
    await expect(guard("owner", work)).rejects.toBeInstanceOf(
      ErpConnectionLimitError,
    );
    expect(work).toHaveBeenCalledTimes(30);
    time += 60_000;
    await expect(guard("owner", work)).resolves.toBe("read");
  });

  it("limits concurrent work and releases successful and failed requests", async () => {
    const guard = createErpConnectionRequestGuard();
    const pending = Promise.withResolvers<void>();
    const first = guard("owner", () => pending.promise);
    const second = guard("owner", () => pending.promise);
    await expect(guard("owner", async () => null)).rejects.toBeInstanceOf(
      ErpConnectionLimitError,
    );
    pending.resolve();
    await Promise.all([first, second]);
    await expect(
      guard("owner", async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    await expect(guard("owner", async () => "read")).resolves.toBe("read");
  });

  it("bounds tracked identities and prunes inactive ones", async () => {
    let time = 0;
    const guard = createErpConnectionRequestGuard(() => time);
    for (let index = 0; index < 100; index += 1) {
      await guard(`owner-${index}`, async () => null);
    }
    await expect(guard("new", async () => null)).rejects.toBeInstanceOf(
      ErpConnectionLimitError,
    );
    await expect(guard("owner-1", async () => null)).resolves.toBeNull();
    time = 60_000;
    await expect(guard("new", async () => null)).resolves.toBeNull();
  });
});
