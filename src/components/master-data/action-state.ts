export interface MasterDataActionState {
  message?: string;
  status?: "error" | "success";
}

export const initialMasterDataActionState: MasterDataActionState = {};
