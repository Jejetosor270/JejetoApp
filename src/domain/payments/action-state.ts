export interface PaymentActionState {
  fieldErrors?: Record<string, string> | undefined;
  formError?: string | undefined;
  message: string;
  status: "idle" | "success" | "error";
}

export const initialPaymentActionState: PaymentActionState = {
  message: "",
  status: "idle",
};
