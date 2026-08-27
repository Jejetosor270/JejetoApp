import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
  PricingMode,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { itemCategories, itemUnits } from "@/config/items";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import type { ManagedItem } from "@/lib/items/items";
import { ItemActionForm } from "@/components/items/item-action-form";

type Options = Awaited<
  ReturnType<typeof import("@/lib/items/items").listItemOptions>
>;
type Action = (
  state: import("@/domain/items/action-state").ItemActionState,
  data: FormData,
) => Promise<import("@/domain/items/action-state").ItemActionState>;
const input =
  "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm";
const area =
  "border-input bg-background min-h-20 w-full rounded-lg border px-3 py-2 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ItemForm({
  action,
  item,
  options,
}: {
  action: Action;
  item?: ManagedItem;
  options: Options;
}) {
  const value = (key: keyof ManagedItem) =>
    item?.[key] == null ? "" : String(item[key]);
  return (
    <ItemActionForm action={action} className="space-y-5 rounded-lg border p-4">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Project *">
          <select
            className={input}
            defaultValue={value("projectId")}
            name="projectId"
            required
          >
            <option value="">Choose Project</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Building">
          <select
            className={input}
            defaultValue={value("buildingId")}
            name="buildingId"
          >
            <option value="">Unallocated</option>
            {options.projects.flatMap((project) =>
              project.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {project.name} · {building.name}
                </option>
              )),
            )}
          </select>
        </Field>
        <Field label="Room">
          <select
            className={input}
            defaultValue={value("roomId")}
            name="roomId"
          >
            <option value="">No Room</option>
            {options.projects.flatMap((project) =>
              project.buildings.flatMap((building) =>
                building.rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {project.name} · {building.name} · {room.name}
                  </option>
                )),
              ),
            )}
          </select>
        </Field>
        <Field label="Item reference">
          <input
            className={input}
            defaultValue={value("itemReference")}
            name="itemReference"
          />
        </Field>
        <Field label="Description *">
          <input
            className={input}
            defaultValue={value("name")}
            name="name"
            required
          />
        </Field>
        <Field label="Supplier">
          <select
            className={input}
            defaultValue={value("supplierId")}
            name="supplierId"
          >
            <option value="">No Supplier</option>
            {options.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier SKU">
          <input
            className={input}
            defaultValue={value("supplierSku")}
            name="supplierSku"
          />
        </Field>
        <Field label="Procurement Order">
          <select
            className={input}
            defaultValue={value("procurementOrderId")}
            name="procurementOrderId"
          >
            <option value="">No Order</option>
            {options.projects.flatMap((project) =>
              project.orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {project.name} · {order.orderNumber}
                </option>
              )),
            )}
          </select>
        </Field>
        <Field label="Category">
          <input
            className={input}
            defaultValue={value("category")}
            list="item-categories"
            name="category"
          />
          <datalist id="item-categories">
            {itemCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>
        <Field label="Brand / manufacturer">
          <input className={input} defaultValue={value("brand")} name="brand" />
        </Field>
        <Field label="Finish / color">
          <input
            className={input}
            defaultValue={value("finishColor")}
            name="finishColor"
          />
        </Field>
        <Field label="Quantity *">
          <input
            className={input}
            defaultValue={value("quantity") || "1"}
            inputMode="decimal"
            name="quantity"
            required
          />
        </Field>
        <Field label="Unit *">
          <input
            className={input}
            defaultValue={value("unitOfMeasure") || "EA"}
            list="item-units"
            name="unitOfMeasure"
            required
          />
          <datalist id="item-units">
            {itemUnits.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </Field>
        <Field label="Purchase currency">
          <select
            className={input}
            defaultValue={value("purchaseCurrencyCode")}
            name="purchaseCurrencyCode"
          >
            <option value="">Not set</option>
            {options.currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit purchase HT">
          <input
            className={input}
            defaultValue={value("unitPurchasePriceHt")}
            inputMode="decimal"
            name="unitPurchasePriceHt"
          />
        </Field>
        <Field label="Total purchase HT">
          <input
            className={input}
            defaultValue={value("totalPurchasePriceHt")}
            inputMode="decimal"
            name="totalPurchasePriceHt"
          />
        </Field>
        <Field label="Pricing method">
          <select
            className={input}
            defaultValue={value("pricingMode") || PricingMode.SELLING_PRICE}
            name="pricingMode"
          >
            {Object.values(PricingMode).map((mode) => (
              <option key={mode} value={mode}>
                {mode.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target margin %">
          <input
            className={input}
            defaultValue={rateToPercentInput(item?.targetMarginRate ?? null)}
            inputMode="decimal"
            name="targetMarginRate"
          />
        </Field>
        <Field label="Unit selling HT">
          <input
            className={input}
            defaultValue={value("unitSellingPriceHt")}
            inputMode="decimal"
            name="unitSellingPriceHt"
          />
        </Field>
        <Field label="Total selling HT">
          <input
            className={input}
            defaultValue={value("totalSellingPriceHt")}
            inputMode="decimal"
            name="totalSellingPriceHt"
          />
        </Field>
        <Field label="VAT treatment">
          <select
            className={input}
            defaultValue={value("vatTreatment")}
            name="vatTreatment"
          >
            <option value="">Not set</option>
            {Object.values(VatTreatment).map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="VAT recoverability">
          <select
            className={input}
            defaultValue={value("vatRecoverability")}
            name="vatRecoverability"
          >
            <option value="">Not set</option>
            {Object.values(VatRecoverability).map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="VAT %">
          <input
            className={input}
            defaultValue={rateToPercentInput(item?.vatRate ?? null)}
            inputMode="decimal"
            name="vatRate"
          />
        </Field>
        <Field label="VAT amount">
          <input
            className={input}
            defaultValue={value("vatAmount")}
            inputMode="decimal"
            name="vatAmount"
          />
        </Field>
        <Field label="Commercial status">
          <select
            className={input}
            defaultValue={
              value("commercialStatus") || ItemCommercialStatus.BUDGET
            }
            name="commercialStatus"
          >
            {Object.values(ItemCommercialStatus).map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Logistics status">
          <select
            className={input}
            defaultValue={
              value("logisticsStatus") || ItemLogisticsStatus.PENDING
            }
            name="logisticsStatus"
          >
            {Object.values(ItemLogisticsStatus).map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      </section>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Physical, logistics and claim details
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(
            ["weightEach", "totalWeight", "volumeEach", "totalVolume"] as const
          ).map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, " $1")}>
              <input
                className={input}
                defaultValue={value(key)}
                inputMode="decimal"
                name={key}
              />
            </Field>
          ))}
          {(
            [
              "estimatedWarehouseDate",
              "estimatedFabricatorDate",
              "receivedFabricatorDate",
              "receivedWarehouseDate",
              "inTransitDate",
              "estimatedResidenceDate",
              "deliveredResidenceDate",
              "installedDate",
              "claimOpenedDate",
              "claimResolvedDate",
            ] as const
          ).map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, " $1")}>
              <input
                className={input}
                defaultValue={value(key)}
                name={key}
                type="date"
              />
            </Field>
          ))}
          {(
            [
              "expectedWarehouseId",
              "receivedWarehouseId",
              "fabricatorId",
              "destinationLocationId",
            ] as const
          ).map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, " $1")}>
              <select className={input} defaultValue={value(key)} name={key}>
                <option value="">Not set</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.type.replaceAll("_", " ")} · {location.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Claim status">
            <input
              className={input}
              defaultValue={value("claimStatus")}
              name="claimStatus"
            />
          </Field>
          <Field label="Issue description">
            <textarea
              className={area}
              defaultValue={value("issueDescription")}
              name="issueDescription"
            />
          </Field>
          <Field label="Claim notes">
            <textarea
              className={area}
              defaultValue={value("claimNotes")}
              name="claimNotes"
            />
          </Field>
        </div>
      </details>
      <Field label="Detailed description">
        <textarea
          className={area}
          defaultValue={value("description")}
          name="description"
        />
      </Field>
      <Field label="Notes">
        <textarea className={area} defaultValue={value("notes")} name="notes" />
      </Field>
    </ItemActionForm>
  );
}
