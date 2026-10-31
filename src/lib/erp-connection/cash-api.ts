import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authenticateCashConnection, ConnectionAccessError } from "./auth";
import { getErpMcpOrigin } from "./config";
import { cashApiRequestSchema } from "./cash-contract";
import { CashProposalError } from "./cash-context";
import {
  prepareCashChange,
  reviewCashChange,
  executeCashChange,
} from "./cash-proposals";
import {
  withErpConnectionIngress,
  withErpConnectionRequest,
  ErpConnectionLimitError,
} from "./request-guard";
import { isPaymentWriteConflict } from "@/lib/payments/edit-version";
import {
  PaymentValidationError,
  PaymentNotFoundError,
} from "@/lib/payments/errors";
import { ClientBillingValidationError } from "@/lib/billing/errors";
import { CreditError } from "@/lib/credits/source";

const bodyLimit = 16_384;
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
async function readInput(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new CashProposalError("Use a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CashProposalError("A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) {
        await reader.cancel();
        throw new CashProposalError("The request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return cashApiRequestSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new CashProposalError(
        "Check the cash action, amount, currency and date. Approval flags are not accepted.",
      );
    throw error;
  }
}
export async function handleErpCashRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Use POST for the private approval bridge." }, 405);
  const origin = getErpMcpOrigin();
  if (!origin || !process.env.ERP_MCP_OWNER_ID)
    return json({ error: "The ERP connection is not configured." }, 503);
  const url = new URL(request.url);
  if (
    url.origin !== origin ||
    url.search ||
    url.username ||
    url.password ||
    (request.headers.has("origin") &&
      request.headers.get("origin") !== origin) ||
    (request.headers.has("host") &&
      request.headers.get("host") !== new URL(origin).host)
  )
    return json({ error: "This request origin is not allowed." }, 403);
  try {
    return await withErpConnectionIngress("cash-endpoint", async () => {
      const connection = await authenticateCashConnection(
        request.headers.get("authorization"),
      );
      if (!connection)
        return json({ error: "A valid cash connection key is required." }, 401);
      return withErpConnectionRequest(connection.actor.id, async () => {
        const input = await readInput(request);
        if (input.operation === "prepare")
          return json(await prepareCashChange(connection, input.change));
        if (input.operation === "review")
          return json(await reviewCashChange(connection, input.proposalId));
        const result = await executeCashChange(connection, input);
        for (const path of [
          "/",
          "/projects",
          "/orders",
          "/billing",
          "/payments",
          "/receipts",
          "/calendar",
          "/reports",
        ]) {
          revalidatePath(path, "layout");
        }
        return json(result);
      });
    });
  } catch (error) {
    if (error instanceof ConnectionAccessError)
      return json(
        { error: "Cash access has ended. Reconnect with an active key." },
        401,
      );
    if (error instanceof CashProposalError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        {
          error:
            "The proposed cash fields are invalid. Review the amount, date and currency.",
        },
        400,
      );
    if (
      error instanceof PaymentValidationError ||
      error instanceof PaymentNotFoundError ||
      error instanceof ClientBillingValidationError ||
      error instanceof CreditError
    )
      return json({ error: error.message }, 400);
    if (error instanceof ErpConnectionLimitError)
      return json({ error: error.message }, 429);
    if (isPaymentWriteConflict(error))
      return json(
        {
          error:
            "The record changed while saving. Retry this proposal to check its saved result, or prepare a new review.",
        },
        409,
      );
    console.error("ERP cash connection failed", {
      category: "cash_request_failed",
    });
    return json(
      {
        error:
          "The cash request could not be completed. Retry the same proposal to check whether it was saved.",
      },
      503,
    );
  }
}
