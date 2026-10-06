import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AssistantLimitError,
  createAssistantRequestGuard,
} from "@/lib/assistant/request-guard";

describe("assistant per-instance request limits", () => {
  it("allows eight requests per employee per minute and expires them", async () => {
    let time = 1_000;
    const guard = createAssistantRequestGuard(() => time);
    const work = vi.fn().mockResolvedValue("done");
    for (let attempt = 0; attempt < 8; attempt += 1) await guard("user", work);
    await expect(guard("user", work)).rejects.toBeInstanceOf(
      AssistantLimitError,
    );
    expect(work).toHaveBeenCalledTimes(8);
    await expect(guard("other", work)).resolves.toBe("done");
    time += 60_000;
    await expect(guard("user", work)).resolves.toBe("done");
  });

  it("blocks simultaneous requests from the same employee and releases on completion", async () => {
    const guard = createAssistantRequestGuard();
    const pending = Promise.withResolvers<string>();
    const first = guard("user", () => pending.promise);
    await expect(guard("user", async () => "duplicate")).rejects.toBeInstanceOf(
      AssistantLimitError,
    );
    pending.resolve("done");
    await first;
    await expect(guard("user", async () => "next")).resolves.toBe("next");
  });

  it("caps overall concurrency and releases failed work", async () => {
    const guard = createAssistantRequestGuard();
    const pending = Promise.withResolvers<void>();
    const requests = Array.from({ length: 4 }, (_, index) =>
      guard(`user-${index}`, () => pending.promise),
    );
    await expect(guard("fifth", async () => "done")).rejects.toBeInstanceOf(
      AssistantLimitError,
    );
    pending.resolve();
    await Promise.all(requests);
    await expect(
      guard("fifth", async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    await expect(guard("fifth", async () => "retry")).resolves.toBe("retry");
  });

  it("bounds tracked users without evicting active limits and prunes expired entries", async () => {
    let time = 0;
    const guard = createAssistantRequestGuard(() => time);
    for (let index = 0; index < 1_000; index += 1)
      await guard(`user-${index}`, async () => null);
    await expect(guard("new-user", async () => null)).rejects.toBeInstanceOf(
      AssistantLimitError,
    );
    await expect(guard("user-0", async () => "known")).resolves.toBe("known");
    time = 60_000;
    await expect(guard("new-user", async () => "new")).resolves.toBe("new");
  });
});
