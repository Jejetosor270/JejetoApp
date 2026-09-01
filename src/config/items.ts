export const itemCategories = [
  "Furniture",
  "Lighting",
  "Decorative",
  "Outdoor",
  "Joinery",
  "Fabric",
  "Accessories",
  "Equipment",
  "Other",
] as const;

export const itemUnits = [
  "EA",
  "PCS",
  "SET",
  "M",
  "M2",
  "M3",
  "LM",
  "KG",
] as const;

export const itemCommercialStatusLabels = {
  BUDGET: "Budget",
  QUOTED: "Quoted",
  SELECTED: "Selected",
  ORDERED: "Ordered",
  CANCELLED: "Cancelled",
} as const;

export const itemLogisticsStatusLabels = {
  PENDING: "Pending",
  IN_PRODUCTION: "In production",
  IN_TRANSIT: "In transit",
  RECEIVED_FABRICATOR: "Received by fabricator",
  RECEIVED_WAREHOUSE: "Received at warehouse",
  DELIVERED_RESIDENCE: "Delivered at residence",
  INSTALLED: "Installed",
  CLAIM: "Claim / issue",
} as const;

export const itemCommercialStatuses = Object.keys(
  itemCommercialStatusLabels,
) as Array<keyof typeof itemCommercialStatusLabels>;
export const itemLogisticsStatuses = Object.keys(
  itemLogisticsStatusLabels,
) as Array<keyof typeof itemLogisticsStatusLabels>;
