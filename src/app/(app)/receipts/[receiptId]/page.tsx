import type { Metadata } from "next";
import { CashRecordPage } from "@/components/payments/cash-record-page";

export const metadata: Metadata = { title: "Client receipt" };
export default async function Page({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  return <CashRecordPage kind="receipt" id={receiptId} />;
}
