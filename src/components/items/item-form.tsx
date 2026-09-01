"use client";

import { useState, useTransition } from "react";

import { createRoomAction } from "@/app/(app)/items/actions";
import {
  itemCategories,
  itemCommercialStatuses,
  itemLogisticsStatuses,
  itemUnits,
} from "@/config/items";
import { vatRecoverabilities, vatTreatments } from "@/config/vat";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
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
  const [projectId, setProjectId] = useState(value("projectId"));
  const [buildingId, setBuildingId] = useState(value("buildingId"));
  const [roomId, setRoomId] = useState(value("roomId"));
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomFeedback, setRoomFeedback] = useState("");
  const [createdRooms, setCreatedRooms] = useState<
    Array<{ buildingId: string; id: string; name: string }>
  >([]);
  const [roomPending, startRoomTransition] = useTransition();
  const [vatTreatment, setVatTreatment] = useState(value("vatTreatment"));
  const [vatRecoverability, setVatRecoverability] = useState(
    value("vatRecoverability"),
  );
  const project = options.projects.find((entry) => entry.id === projectId);
  const rooms = [
    ...(project?.buildings.flatMap((building) => building.rooms) ?? []),
    ...createdRooms,
  ].filter((room) => room.buildingId === buildingId);
  return (
    <ItemActionForm action={action} className="space-y-5 rounded-lg border p-4">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Project *">
          <select
            className={input}
            name="projectId"
            onChange={(event) => {
              setProjectId(event.target.value);
              setBuildingId("");
              setRoomId("");
            }}
            required
            value={projectId}
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
            name="buildingId"
            onChange={(event) => {
              setBuildingId(event.target.value);
              setRoomId("");
            }}
            value={buildingId}
          >
            <option value="">Unallocated</option>
            {project?.buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room">
          <select
            className={input}
            name="roomId"
            onChange={(event) => setRoomId(event.target.value)}
            value={roomId}
          >
            <option value="">No Room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {buildingId ? (
            <div className="mt-2 grid gap-2 rounded-md border p-2">
              <span className="text-muted-foreground">
                Create a Room in this Building
              </span>
              <input
                className={input}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="Room name *"
                value={roomName}
              />
              <input
                className={input}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="Code (optional)"
                value={roomCode}
              />
              <button
                className="border-input h-8 rounded border px-2 text-xs disabled:opacity-50"
                disabled={roomPending || !roomName.trim()}
                onClick={() => {
                  const data = new FormData();
                  data.set("buildingId", buildingId);
                  data.set("name", roomName);
                  data.set("code", roomCode);
                  startRoomTransition(async () => {
                    const result = await createRoomAction(
                      { message: "", status: "idle" },
                      data,
                    );
                    setRoomFeedback(result.message);
                    const newRoom = result.room;
                    if (newRoom) {
                      setCreatedRooms((current) => [...current, newRoom]);
                      setRoomId(newRoom.id);
                      setRoomName("");
                      setRoomCode("");
                    }
                  });
                }}
                type="button"
              >
                {roomPending ? "Creating…" : "Create and select Room"}
              </button>
              {roomFeedback ? <span>{roomFeedback}</span> : null}
            </div>
          ) : null}
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
        <input name="pricingMode" type="hidden" value="SELLING_PRICE" />
        <input name="targetMarginRate" type="hidden" value="" />
        <Field label="Markup %">
          <input
            className={input}
            defaultValue={rateToPercentInput(
              item?.financial.markupRate ?? null,
            )}
            inputMode="decimal"
            name="markupRate"
            placeholder="30.00"
          />
        </Field>
        <Field label="Budget unit HT">
          <input
            className={input}
            defaultValue={value("unitSellingPriceHt")}
            inputMode="decimal"
            name="unitSellingPriceHt"
          />
        </Field>
        <Field label="Budget total HT">
          <input
            className={input}
            defaultValue={value("totalSellingPriceHt")}
            inputMode="decimal"
            name="totalSellingPriceHt"
          />
        </Field>
        <Field label="Budget purchase baseline unit HT">
          <input
            className={input}
            defaultValue={value("budgetPurchaseUnitPriceHt")}
            inputMode="decimal"
            name="budgetPurchaseUnitPriceHt"
          />
        </Field>
        <Field label="Budget purchase baseline total HT">
          <input
            className={input}
            defaultValue={value("budgetPurchaseTotalPriceHt")}
            inputMode="decimal"
            name="budgetPurchaseTotalPriceHt"
          />
        </Field>
        <Field label="Variance comment / reason">
          <input
            className={input}
            defaultValue={value("budgetVarianceComment")}
            name="budgetVarianceComment"
          />
        </Field>
        <Field label="VAT treatment">
          <select
            className={input}
            name="vatTreatment"
            onChange={(event) => {
              const treatment = event.target.value;
              setVatTreatment(treatment);
              if (!inputVatRecoverabilityApplies(treatment))
                setVatRecoverability("");
            }}
            value={vatTreatment}
          >
            <option value="">Not set</option>
            {vatTreatments.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        {inputVatRecoverabilityApplies(vatTreatment) ? (
          <Field label="VAT recoverability">
            <select
              className={input}
              name="vatRecoverability"
              onChange={(event) => setVatRecoverability(event.target.value)}
              value={vatRecoverability}
            >
              <option value="">Choose</option>
              {vatRecoverabilities.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input name="vatRecoverability" type="hidden" value="" />
        )}
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
            defaultValue={value("commercialStatus") || "BUDGET"}
            name="commercialStatus"
          >
            {itemCommercialStatuses.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Logistics status">
          <select
            className={input}
            defaultValue={value("logisticsStatus") || "PENDING"}
            name="logisticsStatus"
          >
            {itemLogisticsStatuses.map((entry) => (
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
