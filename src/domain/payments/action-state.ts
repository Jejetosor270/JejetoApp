export interface PaymentActionState {
  message: string;
  status: "idle" | "success" | "error";
}

export const initialPaymentActionState: PaymentActionState = {
  message: "",
  status: "idle",
};
