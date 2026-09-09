import { notFound } from "next/navigation";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import {
  RecordFields,
  RecordSectionHeading,
} from "@/components/layout/record-presentation";
import { RecordWorkspace } from "@/components/layout/record-workspace";
import { RelatedRecords } from "@/components/layout/related-records";
import { cashRecordEditor } from "./cash-record-editor";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getCashRecord } from "@/lib/related-records/cash-records";
import type { CashRecordKind } from "@/lib/related-records/types";

export async function CashRecordPage({
  kind,
  id,
}: {
  kind: CashRecordKind;
  id: string;
}) {
  const user = await requireUser();
  const record = await getCashRecord(kind, id);
  if (!record) notFound();
  const editor = canEditMasterData(user.role)
    ? await cashRecordEditor(kind, id)
    : undefined;
  const backHref =
    kind === "payment"
      ? "/payments"
      : kind === "receipt"
        ? "/receipts"
        : kind === "client-installment"
          ? "/installments?tab=client"
          : "/installments";
  return (
    <div className="space-y-6">
      <DetailPageHeader
        title={record.title}
        eyebrow={record.type}
        status={record.status}
        meta={record.description}
        backHref={backHref}
        backLabel={
          kind === "payment"
            ? "Payments"
            : kind === "receipt"
              ? "Receipts"
              : "Installments"
        }
        actions={editor}
      />
      <RecordWorkspace
        label={`${record.type} workspace`}
        sections={[
          {
            id: "overview",
            label: "Details",
            group: "details",
            content: (
              <section className="bg-card rounded-lg border p-4">
                <RecordSectionHeading title={record.type} />
                <div className="max-w-3xl">
                  <RecordFields values={record.fields} />
                </div>
              </section>
            ),
          },
          {
            id: "connections",
            label: "Related records",
            group: "related",
            content: <RelatedRecords tables={record.tables} />,
          },
        ]}
      />
    </div>
  );
}
