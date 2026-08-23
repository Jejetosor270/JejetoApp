export const paymentSchedulePresets = {
  "100": ["1"],
  "30-40-30": ["0.30", "0.40", "0.30"],
  "30-70": ["0.30", "0.70"],
  "50-50": ["0.50", "0.50"],
} as const;

export type PaymentSchedulePreset = keyof typeof paymentSchedulePresets;
