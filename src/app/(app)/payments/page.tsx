import { redirect } from "next/navigation";
import {
  CashListPage,
  type CashSearchParams,
} from "@/components/payments/cash-list-page";
import { queryStringFromParams } from "@/domain/listing/validation";
export const metadata = { title: "Payments" };
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<CashSearchParams>;
}) {
  const params = await searchParams;
  if (
    params.tab === "transactions" ||
    params.tab === "overview" ||
    params.tab === "receipts"
  ) {
    const query = new URLSearchParams(queryStringFromParams(params));
    query.delete("page");
    query.delete("tab");
    if (params.direction === "IN" || params.direction === "OUT")
      query.delete("direction");
    const destination =
      params.tab === "receipts" || params.direction === "IN" || params.billingId
        ? "/receipts"
        : "/payments";
    if (params.tab === "receipts") query.set("tab", "entry");
    redirect(destination + (query.size ? "?" + query : ""));
  }
  if (params.tab === "client") {
    const query = new URLSearchParams(queryStringFromParams(params));
    query.set("tab", "client");
    redirect("/installments?" + query);
  }
  return CashListPage({ section: "payments", params });
}
