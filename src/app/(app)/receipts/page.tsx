import {
  CashListPage,
  type CashSearchParams,
} from "@/components/payments/cash-list-page";
export const metadata = { title: "Receipts" };
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<CashSearchParams>;
}) {
  return CashListPage({ section: "receipts", params: await searchParams });
}
