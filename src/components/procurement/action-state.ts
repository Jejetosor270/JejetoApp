export interface OrderActionState {
  fieldErrors?: Record<string, string> | undefined;
  formError?: string | undefined;
  message?: string;
  orderId?: string;
  status?: "error" | "success";
}

export const initialOrderActionState: OrderActionState = {};
