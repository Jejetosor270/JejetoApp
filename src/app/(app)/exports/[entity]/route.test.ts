import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn() }));
const exporter = vi.hoisted(() => ({ operationalCsv: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/export/operational", () => ({
  exportEntities: ["orders", "payments", "suppliers", "clients", "projects"],
  operationalCsv: exporter.operationalCsv,
}));

import { GET } from "@/app/(app)/exports/[entity]/route";

describe("operational CSV export route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated exports before querying data", async () => {
    auth.getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(new Request("https://erp.test/exports/orders"), {
      params: Promise.resolve({ entity: "orders" }),
    });

    expect(response.status).toBe(401);
    expect(exporter.operationalCsv).not.toHaveBeenCalled();
  });

  it("passes validated entity and current URL filters to the CSV exporter", async () => {
    auth.getAuthenticatedUser.mockResolvedValue({ id: "employee-1" });
    exporter.operationalCsv.mockResolvedValue('"Order"\r\n"PO-1"\r\n');

    const response = await GET(
      new Request(
        "https://erp.test/exports/orders?status=DRAFT&currencyCode=EUR&page=3",
      ),
      { params: Promise.resolve({ entity: "orders" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(exporter.operationalCsv).toHaveBeenCalledWith("orders", {
      currencyCode: "EUR",
      page: "3",
      status: "DRAFT",
    });
  });
});
