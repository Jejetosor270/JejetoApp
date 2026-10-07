import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn() }));
const exporter = vi.hoisted(() => ({ reportingCsv: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/reporting/export", () => exporter);
import { GET } from "./route";
beforeEach(() => vi.resetAllMocks());
it("requires authentication before querying financial data", async () => {
  auth.getAuthenticatedUser.mockResolvedValue(null);
  expect(
    (await GET(new Request("https://erp.test/reports/export?dataset=summary")))
      .status,
  ).toBe(401);
  expect(exporter.reportingCsv).not.toHaveBeenCalled();
});
it("rejects invalid and duplicate scope without exporting", async () => {
  auth.getAuthenticatedUser.mockResolvedValue({ id: "employee" });
  for (const query of [
    "dataset=vat&projectId=bad",
    "dataset=vat&dataset=freight",
    "dataset=forecast&cashDelay=365",
  ]) {
    expect(
      (await GET(new Request(`https://erp.test/reports/export?${query}`)))
        .status,
    ).toBe(400);
  }
  expect(exporter.reportingCsv).not.toHaveBeenCalled();
});
it("returns a private attachment with validated scope", async () => {
  auth.getAuthenticatedUser.mockResolvedValue({ id: "employee" });
  exporter.reportingCsv.mockResolvedValue('"Report"\r\n"forecast"');
  const response = await GET(
    new Request(
      "https://erp.test/reports/export?dataset=forecast&cashDelay=30&horizon=90d",
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain(
    "report-forecast.csv",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(exporter.reportingCsv).toHaveBeenCalledWith(
    expect.objectContaining({
      dataset: "forecast",
      cashDelay: "30",
      horizon: "90d",
    }),
  );
});
it("does not leak provider or record details on export failures", async () => {
  auth.getAuthenticatedUser.mockResolvedValue({ id: "employee" });
  exporter.reportingCsv.mockRejectedValue(
    new Error("Private financial record"),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await GET(
    new Request("https://erp.test/reports/export?dataset=vat"),
  );
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("Private");
  expect(log).toHaveBeenCalledWith("Report CSV generation failed.", {
    dataset: "vat",
  });
  log.mockRestore();
});
