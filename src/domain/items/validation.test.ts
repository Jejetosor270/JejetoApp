import { describe, expect, it } from "vitest";

import {
  createItemInputSchema,
  createLocationInputSchema,
  createRoomInputSchema,
} from "@/domain/items/validation";

const base = {
  commercialStatus: "BUDGET",
  logisticsStatus: "PENDING",
  name: "Dining Chair",
  pricingMode: "SELLING_PRICE",
  projectId: "b3b6cd92-24c5-4661-81d1-3dc1bd2eed3f",
  quantity: "2.5",
  unitOfMeasure: "m2",
};

describe("Item, Room, and Location validation", () => {
  it("accepts Decimal quantity and normalizes extensible units", () => {
    const result = createItemInputSchema.parse(base);
    expect(result.quantity).toBe("2.5000");
    expect(result.unitOfMeasure).toBe("M2");
  });

  it("requires a Building when a Room is selected", () => {
    const result = createItemInputSchema.safeParse({
      ...base,
      roomId: "c56dbf34-60ef-4d12-8270-b029eba51b3e",
    });
    expect(result.success).toBe(false);
  });

  it("validates Room and Location master data", () => {
    expect(
      createRoomInputSchema.safeParse({
        buildingId: "c56dbf34-60ef-4d12-8270-b029eba51b3e",
        name: "Living Room",
      }).success,
    ).toBe(true);
    expect(
      createLocationInputSchema.safeParse({
        countryCode: "FR",
        name: "Paris Warehouse",
        type: "WAREHOUSE",
      }).success,
    ).toBe(true);
  });
});
