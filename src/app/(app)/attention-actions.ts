"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getFinancialAttention } from "@/lib/reporting/financial-attention";
import {
  attentionSnoozeSchema,
  validSnoozeDate,
} from "@/domain/finance/attention-snooze";
import { businessToday, dateOnlyToDate } from "@/domain/payments/dates";
import { z } from "zod";

export async function snoozeAttention(input: unknown) {
  const user = await requireUser();
  const parsed = attentionSnoozeSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: "Enter a valid date and a reason (up to 300 characters).",
    };
  const data = parsed.data;
  if (!validSnoozeDate(data.until, businessToday()))
    return {
      ok: false,
      message: "Choose a return date between tomorrow and one year from today.",
    };
  try {
    const snapshot = await getFinancialAttention(data.horizon);
    const issue = snapshot.issues.find((row) => row.key === data.key);
    if (!issue || issue.fingerprint !== data.fingerprint)
      return {
        ok: false,
        message:
          "This issue has changed or been resolved. Refresh Home before snoozing it.",
      };
    await getDatabase().financialAttentionSnooze.upsert({
      where: { userId_issueKey: { userId: user.id, issueKey: data.key } },
      create: {
        userId: user.id,
        issueKey: data.key,
        fingerprint: data.fingerprint,
        until: dateOnlyToDate(data.until),
        reason: data.reason,
      },
      update: {
        fingerprint: data.fingerprint,
        until: dateOnlyToDate(data.until),
        reason: data.reason,
      },
    });
    revalidatePath("/");
    return { ok: true, message: "Snoozed for you only." };
  } catch {
    return {
      ok: false,
      message:
        "Could not save the snooze. Your entries are retained; please try again.",
    };
  }
}

export async function unsnoozeAttention(input: unknown) {
  const user = await requireUser();
  const key = z.string().max(120).safeParse(input);
  if (!key.success) return { ok: false, message: "Choose a valid reminder." };
  try {
    await getDatabase().financialAttentionSnooze.deleteMany({
      where: { userId: user.id, issueKey: key.data },
    });
    revalidatePath("/");
    return { ok: true, message: "Reminder restored." };
  } catch {
    return {
      ok: false,
      message: "Could not restore this reminder. Please try again.",
    };
  }
}
