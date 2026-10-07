import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { reportExportSchema } from "@/domain/reporting/export-options";
import { reportingCsv } from "@/lib/reporting/export";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user)
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  const query = new URL(request.url).searchParams;
  const values = Object.fromEntries(
    [...new Set(query.keys())].map((key) => [
      key,
      query.getAll(key).length === 1 ? query.get(key) : query.getAll(key),
    ]),
  );
  const parsed = reportExportSchema.safeParse(values);
  if (!parsed.success)
    return new Response(
      "Invalid report filters. Period reports need both dates (or neither), spanning at most two years.",
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    const csv = await reportingCsv(parsed.data);
    return new Response(csv, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${parsed.data.dataset}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Report CSV generation failed.", {
      dataset: parsed.data.dataset,
    });
    return new Response("The report could not be generated. Please retry.", {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
