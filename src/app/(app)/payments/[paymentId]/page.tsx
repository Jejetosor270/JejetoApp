import type { Metadata } from "next";
import { CashRecordPage } from "@/components/payments/cash-record-page";

export const metadata: Metadata = { title: "Supplier payment" };
export default async function Page({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <CashRecordPage kind="payment" id={paymentId} />;
}
