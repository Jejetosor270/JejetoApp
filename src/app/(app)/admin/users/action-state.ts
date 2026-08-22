export interface UpdatedEmployeeActionData {
  email: string;
  id: string;
  isActive: boolean;
  name: string;
  role: "ADMIN" | "MANAGER" | "USER";
}

export interface UserActionState {
  employee?: UpdatedEmployeeActionData;
  message?: string;
  status?: "error" | "success";
}

export const initialUserActionState: UserActionState = {};
