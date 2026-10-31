import {
  erpMcpMethodNotAllowed,
  handleErpMcpRequest,
} from "@/lib/erp-connection/transport";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleErpMcpRequest(request);
}

export async function GET() {
  return erpMcpMethodNotAllowed();
}

export async function DELETE() {
  return erpMcpMethodNotAllowed();
}
