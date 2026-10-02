import "server-only";
import type { AttentionHorizon } from "@/domain/finance/attention";
import { businessToday } from "@/domain/payments/dates";
import {
  attentionFingerprint,
  getFinancialAttention,
} from "./financial-attention";
import { getAttentionDataQuality } from "./attention-data-quality";

/** Extra review issues do not enter any financial calculation or Project balance. */
export async function getAttentionWorkspace(
  horizon: AttentionHorizon,
  today = businessToday(),
) {
  const [snapshot, quality] = await Promise.all([
    getFinancialAttention(horizon, today),
    getAttentionDataQuality(today),
  ]);
  return {
    projects: snapshot.projects,
    issues: [
      ...snapshot.issues,
      ...quality.map((issue) => ({
        ...issue,
        fingerprint: attentionFingerprint(issue),
      })),
    ],
  };
}
