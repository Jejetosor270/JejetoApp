export interface OrderActionState {
  message?: string;
  orderId?: string;
  status?: "error" | "success";
}

export const initialOrderActionState: OrderActionState = {};
