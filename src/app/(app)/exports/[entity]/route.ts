import { exportEntities, operationalCsv } from "@/lib/export/operational";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { entity } = await params;
  const selected = exportEntities.find((item) => item === entity);
  if (!selected) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const values: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    values[key] = value;
  });
  try {
    const csv = await operationalCsv(selected, values);
    return new Response(csv, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${selected}-export.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to export operational CSV.", {
      entity: selected,
      error: error instanceof Error ? error.message : typeof error,
      userId: user.id,
    });
    return new Response("The export could not be generated.", { status: 500 });
  }
}
