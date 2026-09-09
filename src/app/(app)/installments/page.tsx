import {
  CashListPage,
  type CashSearchParams,
} from "@/components/payments/cash-list-page";
export const metadata = { title: "Installments" };
export default async function InstallmentsPage({
  searchParams,
}: {
  searchParams: Promise<CashSearchParams>;
}) {
  return CashListPage({ section: "installments", params: await searchParams });
}
