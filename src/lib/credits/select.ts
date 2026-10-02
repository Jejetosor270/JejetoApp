/** Shared read projection: cancellation removes a financial effect, not its history. */
export const activeCreditsInclude = {
  where: { isCancelled: false },
  include: {
    allocations: true,
    refunds: { where: { isCancelled: false } },
  },
} as const;

/** History/workspace reads retain cancelled entries for audit and correction context. */
export const creditHistoryInclude = {
  include: { allocations: true, refunds: true },
} as const;
