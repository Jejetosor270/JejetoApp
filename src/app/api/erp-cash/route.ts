import { handleErpCashRequest } from "@/lib/erp-connection/cash-api";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return handleErpCashRequest(request);
}
