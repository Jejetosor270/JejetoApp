"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createBuildingAction,
  updateBuildingAction,
  updateProjectAction,
} from "@/app/(app)/projects/[projectId]/actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  StatusBadge,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { countries } from "@/config/countries";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";

interface Option {
  id: string;
  name: string;
}
interface CurrencyOption {
  code: string;
  name: string;
}
interface ProjectView {
  client: { id: string; displayName: string };
  clientId: string;
  code: string;
  countryCode: string | null;
  expectedCompletionDate: string | null;
  id: string;
  name: string;
  notes: string | null;
  projectManager: Option | null;
  projectManagerId: string | null;
  reportingCurrencyCode: string;
  startDate: string | null;
  status: string;
}
interface BuildingView {
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  shortCode: string;
}
interface ProjectOrderView {
  committedLandedCost: string | null;
  grossMarginRate: string | null;
  id: string;
  orderCurrencyCode: string;
  orderNumber: string;
  packageName: string;
  sellingCurrencyCode: string;
  status: string;
  supplierName: string;
  totalSellingRevenue: string | null;
}
const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  PLANNING: "Planning",
};
function inputDate(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function ProjectFields({
  clients,
  currencies,
  managers,
  project,
  statuses,
}: {
  clients: { id: string; displayName: string }[];
  currencies: CurrencyOption[];
  managers: Option[];
  project: ProjectView;
  statuses: string[];
}) {
  return (
    <>
      <Field label="Project name">
        <input
          className={inputClassName}
          defaultValue={project.name}
          name="name"
          required
        />
      </Field>
      <Field label="Project code">
        <input
          className={inputClassName}
          defaultValue={project.code}
          name="code"
          required
        />
      </Field>
      <Field label="Client">
        <select
          className={inputClassName}
          defaultValue={project.clientId}
          name="clientId"
          required
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Country">
        <select
          className={inputClassName}
          defaultValue={project.countryCode ?? ""}
          name="countryCode"
        >
          <option value="">Not specified</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reporting currency">
        <select
          className={inputClassName}
          defaultValue={project.reportingCurrencyCode}
          name="reportingCurrencyCode"
        >
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Project manager">
        <select
          className={inputClassName}
          defaultValue={project.projectManagerId ?? ""}
          name="projectManagerId"
        >
          <option value="">Not assigned</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Start date">
        <input
          className={inputClassName}
          defaultValue={inputDate(project.startDate)}
          name="startDate"
          type="date"
        />
      </Field>
      <Field label="Expected completion">
        <input
          className={inputClassName}
          defaultValue={inputDate(project.expectedCompletionDate)}
          name="expectedCompletionDate"
          type="date"
        />
      </Field>
      <Field label="Status">
        <select
          className={inputClassName}
          defaultValue={project.status}
          name="status"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status] ?? status}
            </option>
          ))}
        </select>
      </Field>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2 xl:col-span-3">
        Notes
        <textarea
          className={`${inputClassName} h-20 py-2`}
          defaultValue={project.notes ?? ""}
          name="notes"
        />
      </label>
    </>
  );
}
function EditProject({
  clients,
  currencies,
  managers,
  onClose,
  project,
  statuses,
}: {
  clients: { id: string; displayName: string }[];
  currencies: CurrencyOption[];
  managers: Option[];
  onClose: () => void;
  project: ProjectView;
  statuses: string[];
}) {
  const [state, action, pending] = useActionState(
    updateProjectAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex justify-between">
        <h2 className="text-sm font-semibold">Edit project</h2>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          Close
        </Button>
      </div>
      <form
        action={action}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <input name="id" type="hidden" value={project.id} />
        <ProjectFields
          clients={clients}
          currencies={currencies}
          managers={managers}
          project={project}
          statuses={statuses}
        />
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>Save changes</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}
function BuildingForm({
  building,
  projectId,
  onClose,
}: {
  building?: BuildingView;
  projectId: string;
  onClose?: () => void;
}) {
  const [createState, createAction, createPending] = useActionState(
    createBuildingAction,
    initialMasterDataActionState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateBuildingAction,
    initialMasterDataActionState,
  );
  const isEdit = Boolean(building);
  const state = isEdit ? updateState : createState;
  const action = isEdit ? updateAction : createAction;
  const pending = isEdit ? updatePending : createPending;
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex justify-between">
        <h2 className="text-sm font-semibold">
          {isEdit ? "Edit building" : "Add building"}
        </h2>
        {onClose ? (
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            Close
          </Button>
        ) : null}
      </div>
      <form
        action={action}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <input name="projectId" type="hidden" value={projectId} />
        {building ? (
          <input name="id" type="hidden" value={building.id} />
        ) : null}
        <Field label="Building name">
          <input
            className={inputClassName}
            defaultValue={building?.name}
            name="name"
            required
          />
        </Field>
        <Field label="Short code">
          <input
            className={inputClassName}
            defaultValue={building?.shortCode}
            name="shortCode"
            required
          />
        </Field>
        <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
          Description
          <textarea
            className={`${inputClassName} h-20 py-2`}
            defaultValue={building?.description ?? ""}
            name="description"
          />
        </label>
        {building ? (
          <label className="flex h-9 items-center gap-2 self-end text-sm font-medium">
            <input
              className="accent-primary size-4"
              defaultChecked={building.isActive}
              name="isActive"
              type="checkbox"
            />
            Building active
          </label>
        ) : null}
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>
            {isEdit ? "Save building" : "Add building"}
          </SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

export function ProjectDetail({
  buildings,
  canEdit,
  clients,
  currencies,
  managers,
  orders,
  project,
  statuses,
}: {
  buildings: BuildingView[];
  canEdit: boolean;
  clients: { id: string; displayName: string }[];
  currencies: CurrencyOption[];
  managers: Option[];
  orders: ProjectOrderView[];
  project: ProjectView;
  statuses: string[];
}) {
  const [editingProject, setEditingProject] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<BuildingView | null>(
    null,
  );
  const [addingBuilding, setAddingBuilding] = useState(false);
  return (
    <div className="space-y-5">
      {canEdit && editingProject ? (
        <EditProject
          clients={clients}
          currencies={currencies}
          managers={managers}
          onClose={() => setEditingProject(false)}
          project={project}
          statuses={statuses}
        />
      ) : null}
      <section className="bg-card rounded-lg border p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <div>
            <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
              {project.code}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {project.client.displayName} · {project.reportingCurrencyCode} ·{" "}
              {statusLabels[project.status] ?? project.status}
            </p>
          </div>
          {canEdit ? (
            <Button
              onClick={() => setEditingProject(true)}
              type="button"
              variant="outline"
            >
              <Pencil data-icon="inline-start" />
              Edit project
            </Button>
          ) : null}
        </div>
        {project.notes ? (
          <p className="text-muted-foreground mt-5 border-t pt-4 text-sm leading-6">
            {project.notes}
          </p>
        ) : null}
      </section>
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Procurement orders</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Supplier packages assigned to this project.
            </p>
          </div>
          {canEdit ? (
            <Link
              className="border-input inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium"
              href="/orders"
            >
              Manage orders
            </Link>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Committed landed</th>
                <th className="px-4 py-3 text-right">Selling revenue</th>
                <th className="px-4 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium hover:underline"
                      href={`/orders/${order.id}`}
                    >
                      {order.packageName}
                    </Link>
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">{order.supplierName}</td>
                  <td className="px-4 py-3">
                    {order.status.replaceAll("_", " ")}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatMoney(
                      order.committedLandedCost,
                      order.orderCurrencyCode,
                    )}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatMoney(
                      order.totalSellingRevenue,
                      order.sellingCurrencyCode,
                    )}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatRate(order.grossMarginRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-sm">
            No procurement orders have been added to this project.
          </p>
        ) : null}
      </section>
      {canEdit && addingBuilding ? (
        <BuildingForm
          onClose={() => setAddingBuilding(false)}
          projectId={project.id}
        />
      ) : null}
      {editingBuilding ? (
        <BuildingForm
          building={editingBuilding}
          onClose={() => setEditingBuilding(null)}
          projectId={project.id}
        />
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Buildings / Units</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Buildings are managed within this project.
            </p>
          </div>
          {canEdit ? (
            <Button
              onClick={() => setAddingBuilding(true)}
              size="sm"
              type="button"
            >
              <Plus data-icon="inline-start" />
              Add building
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[35rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Short code</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {buildings.map((building) => (
                <tr className="hover:bg-muted/25" key={building.id}>
                  <td className="px-4 py-3 font-medium">{building.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {building.shortCode}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {building.description ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={building.isActive} />
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <Button
                        onClick={() => setEditingBuilding(building)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {buildings.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-sm">
            No buildings have been added to this project.
          </p>
        ) : null}
      </section>
    </div>
  );
}
