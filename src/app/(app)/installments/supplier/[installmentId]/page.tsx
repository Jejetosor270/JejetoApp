import type { Metadata } from "next";
import { CashRecordPage } from "@/components/payments/cash-record-page";

export const metadata: Metadata = { title: "Supplier installment" };
export default async function Page({
  params,
}: {
  params: Promise<{ installmentId: string }>;
}) {
  const { installmentId } = await params;
  return <CashRecordPage kind="supplier-installment" id={installmentId} />;
}
