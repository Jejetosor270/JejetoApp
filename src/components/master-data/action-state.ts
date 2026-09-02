export interface MasterDataActionState {
  fieldErrors?: Record<string, string> | undefined;
  formError?: string | undefined;
  message?: string;
  status?: "idle" | "error" | "success";
}

export const initialMasterDataActionState: MasterDataActionState = {};
