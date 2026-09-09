"use client";
import { DateInput } from "@/components/forms/date-input";

import { hasUnsavedDrafts } from "@/components/forms/draft-guard";
import Link from "next/link";
import { RelatedRecordTable } from "@/components/layout/related-records";
import { RecordWorkspace } from "@/components/layout/record-workspace";
import { ProjectRecordDetails } from "@/components/master-data/project-record-details";
import { FormSection } from "@/components/forms/form-section";
import type { MasterDataActionState } from "@/components/master-data/action-state";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import Decimal from "decimal.js";
import { Pencil, Plus } from "lucide-react";
import { type ReactNode, useEffect, useState, useTransition } from "react";

import {
  createRoomAction,
  updateRoomInlineAction,
} from "@/app/(app)/items/actions";
import {
  createBuildingAction,
  updateBuildingAction,
  updateProjectAction,
} from "@/app/(app)/projects/[projectId]/actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import {
  InlineCheckbox,
  InlineEditActions,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { countries } from "@/config/countries";
import { formatEnumLabel } from "@/domain/presentation/labels";

interface Option {
  id: string;
  name: string;
}
interface CurrencyOption {
  code: string;
  name: string;
}
export interface ProjectView {
  clientBudgetTargetHt: { toString(): string } | string | null;
  client: { id: string; displayName: string };
  clientId: string;
  defaultFreightMarkupRate: { toString(): string } | string;
  defaultOtherCostMarkupRate: { toString(): string } | string;
  defaultProductMarkupRate: { toString(): string } | string;
  code: string;
  countryCode: string | null;
  expectedCompletionDate: string | null;
  estimatedFreightCostHt: { toString(): string } | string | null;
  estimatedPurchaseCostHt: { toString(): string } | string | null;
  expectedSellHt: { toString(): string } | string | null;
  freightEstimateNotes: string | null;
  freightEstimateRate: { toString(): string } | string | null;
  id: string;
  name: string;
  notes: string | null;
  projectManager: Option | null;
  projectManagerId: string | null;
  reportingCurrencyCode: string;
  reportingCurrencyLocked: boolean;
  startDate: string | null;
  status: string;
  targetMarkupRate: { toString(): string } | string | null;
  targetMode: "MARKUP" | "EXPECTED_SELL";
}
interface BuildingView {
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  shortCode: string;
  rooms: Array<{
    code: string | null;
    id: string;
    isActive: boolean;
    name: string;
    notes: string | null;
  }>;
}
function inputDate(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function ProjectFields({
  fieldErrors,
  clients,
  currencies,
  managers,
  project,
  statuses,
}: {
  fieldErrors?: MasterDataActionState["fieldErrors"];
  clients: { id: string; displayName: string }[];
  currencies: CurrencyOption[];
  managers: Option[];
  project: ProjectView;
  statuses: string[];
}) {
  return (
    <>
      <FormSection title="General">
        <Field error={fieldErrors?.name} required label="Project name">
          <input
            className={inputClassName}
            defaultValue={project.name}
            name="name"
            required
          />
        </Field>
        <Field error={fieldErrors?.code} required label="Project code">
          <input
            className={inputClassName}
            defaultValue={project.code}
            name="code"
            required
          />
        </Field>
        <Field error={fieldErrors?.clientId} required label="Client">
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
        <Field error={fieldErrors?.countryCode} label="Country">
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
        <Field
          error={fieldErrors?.reportingCurrencyCode}
          label="Reporting currency"
        >
          {project.reportingCurrencyLocked ? (
            <input
              name="reportingCurrencyCode"
              type="hidden"
              value={project.reportingCurrencyCode}
            />
          ) : null}
          <select
            className={inputClassName}
            defaultValue={project.reportingCurrencyCode}
            disabled={project.reportingCurrencyLocked}
            name="reportingCurrencyCode"
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.name}
              </option>
            ))}
          </select>
          {project.reportingCurrencyLocked ? (
            <span className="text-muted-foreground text-xs leading-5 font-normal">
              Locked after the first Order because historical FX and reporting
              values depend on this currency.
            </span>
          ) : null}
        </Field>
        <Field error={fieldErrors?.projectManagerId} label="Project manager">
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
        <Field error={fieldErrors?.status} label="Status">
          <select
            className={inputClassName}
            defaultValue={project.status}
            name="status"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatEnumLabel(status)}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>
      <FormSection title="Schedule">
        <Field error={fieldErrors?.startDate} label="Start date">
          <DateInput
            className={inputClassName}
            defaultValue={inputDate(project.startDate)}
            name="startDate"
          />
        </Field>
        <Field
          error={fieldErrors?.expectedCompletionDate}
          label="Expected completion"
        >
          <DateInput
            className={inputClassName}
            defaultValue={inputDate(project.expectedCompletionDate)}
            name="expectedCompletionDate"
          />
        </Field>
      </FormSection>
      <FormSection
        title="Planning / Budget"
        description="Amounts are HT in the Project reporting currency. Freight allowance applies to expected Product Purchase Cost HT."
      >
        <Field
          error={fieldErrors?.clientBudgetTargetHt}
          label="Client Budget Target HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.clientBudgetTargetHt?.toString() ?? ""}
            name="clientBudgetTargetHt"
          />
        </Field>
        <Field
          error={fieldErrors?.estimatedPurchaseCostHt}
          label="Estimated Purchase Cost HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.estimatedPurchaseCostHt?.toString() ?? ""}
            name="estimatedPurchaseCostHt"
          />
        </Field>
        <Field
          error={fieldErrors?.estimatedFreightCostHt}
          label="Estimated Freight / Logistics HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.estimatedFreightCostHt?.toString() ?? ""}
            name="estimatedFreightCostHt"
          />
        </Field>
        <Field
          error={fieldErrors?.freightEstimateRate}
          label="Expected freight allowance %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={
              project.freightEstimateRate
                ? new Decimal(project.freightEstimateRate.toString())
                    .times(100)
                    .toString()
                : ""
            }
            name="freightEstimateRate"
          />
        </Field>
      </FormSection>
      <FormSection title="Default Pricing">
        <Field
          error={fieldErrors?.defaultProductMarkupRate}
          label="Default Product Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultProductMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultProductMarkupRate"
          />
        </Field>
        <Field
          error={fieldErrors?.defaultFreightMarkupRate}
          label="Default Freight Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultFreightMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultFreightMarkupRate"
          />
        </Field>
        <Field
          error={fieldErrors?.defaultOtherCostMarkupRate}
          label="Default Other Cost Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultOtherCostMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultOtherCostMarkupRate"
          />
        </Field>
      </FormSection>
      <input name="targetMode" type="hidden" value="MARKUP" />
      <FormSection title="Freight">
        <div className="@min-[28rem]:col-span-2">
          <Field
            error={fieldErrors?.freightEstimateNotes}
            label="Expected freight allowance notes"
          >
            <input
              className={inputClassName}
              defaultValue={project.freightEstimateNotes ?? ""}
              name="freightEstimateNotes"
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Notes">
        <div className="@min-[28rem]:col-span-2">
          <Field label="Notes" error={fieldErrors?.notes}>
            <textarea
              className={`${inputClassName} h-24 py-2`}
              defaultValue={project.notes ?? ""}
              name="notes"
            />
          </Field>
        </div>
      </FormSection>
    </>
  );
}
export function EditProject({
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
  const { state, onSubmit, pending } = usePersistentActionState(
    updateProjectAction,
    initialMasterDataActionState,
  );
  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);
  return (
    <form onSubmit={onSubmit} className="@container space-y-7">
      <input name="id" type="hidden" value={project.id} />
      <ProjectFields
        fieldErrors={state.fieldErrors}
        clients={clients}
        currencies={currencies}
        managers={managers}
        project={project}
        statuses={statuses}
      />
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <SubmitButton pending={pending}>Save changes</SubmitButton>
        <ActionFeedback state={state} />
      </div>
    </form>
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
  const create = usePersistentActionState(
    createBuildingAction,
    initialMasterDataActionState,
  );
  const update = usePersistentActionState(
    updateBuildingAction,
    initialMasterDataActionState,
  );
  const isEdit = Boolean(building);
  const state = isEdit ? update.state : create.state;
  const onSubmit = isEdit ? update.onSubmit : create.onSubmit;
  const pending = isEdit ? update.pending : create.pending;
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex justify-between">
        <h2 className="text-sm font-semibold">
          {isEdit ? "Edit building" : "Add building"}
        </h2>
        {onClose ? (
          <Button
            onClick={() => {
              if (
                !hasUnsavedDrafts() ||
                window.confirm("Discard your unsaved changes?")
              )
                onClose?.();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Close
          </Button>
        ) : null}
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-2"
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
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-2">
          <SubmitButton pending={pending}>
            {isEdit ? "Save building" : "Add building"}
          </SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

function RoomForm({
  buildingId,
  onClose,
}: {
  buildingId: string;
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    createRoomAction,
    {
      message: "",
      status: "idle" as const,
    },
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-3 flex justify-between">
        <h2 className="text-sm font-semibold">Add Room</h2>
        <Button
          onClick={() => {
            if (
              !hasUnsavedDrafts() ||
              window.confirm("Discard your unsaved changes?")
            )
              onClose?.();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Close
        </Button>
      </div>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
        <input name="buildingId" type="hidden" value={buildingId} />
        <Field label="Room name">
          <input className={inputClassName} name="name" required />
        </Field>
        <Field label="Code / reference">
          <input className={inputClassName} name="code" />
        </Field>
        <Field label="Notes">
          <input className={inputClassName} name="notes" />
        </Field>
        <div className="flex items-center gap-3 md:col-span-3">
          <SubmitButton pending={pending}>Create Room</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

function RoomInlineEditor({
  canEdit,
  room,
}: {
  canEdit: boolean;
  room: BuildingView["rooms"][number];
}) {
  const initial = () => ({
    code: room.code ?? "",
    isActive: room.isActive,
    name: room.name,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    const data = new FormData();
    data.set("id", room.id);
    data.set("code", draft.code);
    data.set("name", draft.name);
    if (draft.isActive) data.set("isActive", "on");
    startTransition(async () => {
      const result = await updateRoomInlineAction(data);
      setFeedback(result.message);
      if (result.status === "success" && result.values) {
        const next = {
          code: result.values.code ?? "",
          isActive: result.values.isActive,
          name: result.values.name,
        };
        setSaved(next);
        setDraft(next);
        setEditing(false);
      }
    });
  };
  return (
    <div className="flex min-w-80 items-center gap-2 border-b py-1 last:border-0">
      {editing ? (
        <>
          <InlineTextInput
            ariaLabel="Room code"
            className="w-20"
            onChange={(value) =>
              setDraft((current) => ({ ...current, code: value }))
            }
            value={draft.code}
          />
          <InlineTextInput
            ariaLabel="Room name"
            onChange={(value) =>
              setDraft((current) => ({ ...current, name: value }))
            }
            value={draft.name}
          />
          <InlineCheckbox
            ariaLabel="Room active"
            checked={draft.isActive}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                isActive: event.target.checked,
              }))
            }
          />
        </>
      ) : (
        <span className="min-w-40">
          {saved.code ? `${saved.code} · ` : ""}
          {saved.name}
          {saved.isActive ? "" : " · Inactive"}
        </span>
      )}
      {canEdit ? (
        <InlineEditActions
          editing={editing}
          feedback={feedback}
          onCancel={() => {
            setDraft(saved);
            setFeedback("");
            setEditing(false);
          }}
          onEdit={() => {
            setDraft(saved);
            setFeedback("");
            setEditing(true);
          }}
          onSave={save}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

export function ProjectDetail({
  buildings,
  canEdit,
  clients,
  currencies,
  workspace,
  managers,
  project,
  statuses,
}: {
  buildings: BuildingView[];
  canEdit: boolean;
  clients: { id: string; displayName: string }[];
  currencies: CurrencyOption[];
  workspace: {
    related?: ReactNode;
    overview: ReactNode;
    finance: ReactNode;
    budget: ReactNode;
    packages: ReactNode;
    freightExpenses: ReactNode;
    items: ReactNode;
  };
  managers: Option[];
  project: ProjectView;
  statuses: string[];
}) {
  const [editingProject, setEditingProject] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<BuildingView | null>(
    null,
  );
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [addingRoomTo, setAddingRoomTo] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      {
        <>
          {
            <DetailPageHeader
              actions={
                canEdit ? (
                  <Button
                    onClick={() => setEditingProject(true)}
                    type="button"
                    variant="outline"
                  >
                    <Pencil data-icon="inline-start" />
                    Edit project
                  </Button>
                ) : undefined
              }
              backHref="/projects"
              backLabel="Back to Projects"
              eyebrow={project.code}
              meta={
                <>
                  <span>
                    {project.client.displayName} ·{" "}
                    {project.reportingCurrencyCode}
                  </span>
                </>
              }
              status={project.status}
              title={project.name}
            />
          }
          {canEdit && editingProject ? (
            <EditorDrawer
              open
              title="Edit project"
              onOpenChange={(open) => {
                if (!open) (() => setEditingProject(false))();
              }}
            >
              <EditProject
                clients={clients}
                currencies={currencies}
                managers={managers}
                onClose={() => setEditingProject(false)}
                project={project}
                statuses={statuses}
              />
            </EditorDrawer>
          ) : null}
        </>
      }
      <RecordWorkspace
        label="Project workspace"
        sections={[
          {
            id: "overview",
            group: "details",
            label: "Overview",
            content: workspace.overview,
          },
          {
            id: "general",
            group: "details",
            label: "General & planning",
            content: <ProjectRecordDetails project={project} />,
          },
          {
            id: "finance",
            group: "details",
            label: "Financial detail · targets, freight & VAT",
            content: workspace.finance,
          },
          {
            id: "budget",
            group: "details",
            label: "Purchase budget",
            content: workspace.budget,
          },
          {
            id: "work",
            group: "related",
            label: "Project work",
            content: (
              <div className="space-y-4">
                {workspace.related}
                <Link
                  className="text-primary text-sm underline"
                  href={"/reports?projectId=" + project.id}
                >
                  Open Project reports
                </Link>
                {workspace.items}
              </div>
            ),
          },
          {
            id: "orders",
            group: "related",
            label: "Order Packages",
            content: workspace.packages,
          },
          {
            id: "freight",
            group: "related",
            label: "Freight expenses",
            content: workspace.freightExpenses,
          },
          {
            id: "buildings",
            group: "related",
            label: "Buildings & Rooms",
            content: (
              <>
                {canEdit && addingBuilding ? (
                  <EditorDrawer
                    open
                    title="Building"
                    onOpenChange={(open) => {
                      if (!open)
                        (() => {
                          setAddingBuilding(false);
                          setEditingBuilding(null);
                        })();
                    }}
                  >
                    <BuildingForm
                      onClose={() => {
                        setAddingBuilding(false);
                        setEditingBuilding(null);
                      }}
                      projectId={project.id}
                    />
                  </EditorDrawer>
                ) : null}
                {editingBuilding ? (
                  <EditorDrawer
                    open
                    title="Building"
                    onOpenChange={(open) => {
                      if (!open)
                        (() => {
                          setAddingBuilding(false);
                          setEditingBuilding(null);
                        })();
                    }}
                  >
                    <BuildingForm
                      building={editingBuilding}
                      onClose={() => {
                        setAddingBuilding(false);
                        setEditingBuilding(null);
                      }}
                      projectId={project.id}
                    />
                  </EditorDrawer>
                ) : null}
                {canEdit && addingRoomTo ? (
                  <EditorDrawer
                    open
                    title="Add room"
                    onOpenChange={(open) => {
                      if (!open) (() => setAddingRoomTo(null))();
                    }}
                  >
                    <RoomForm
                      buildingId={addingRoomTo}
                      onClose={() => setAddingRoomTo(null)}
                    />
                  </EditorDrawer>
                ) : null}
                <RelatedRecordTable
                  table={{
                    id: "buildings",
                    title: "Buildings",
                    description:
                      "Buildings within this Project. Manage their details and Rooms here.",
                    columns: [
                      "Building",
                      "Code",
                      "Description",
                      "Rooms",
                      "Status",
                    ],
                    numericColumns: [3],
                    rows: buildings.map((building) => ({
                      id: building.id,
                      cells: [
                        building.name,
                        building.shortCode,
                        building.description ?? "—",
                        String(building.rooms.length),
                        building.isActive ? "Active" : "Archived",
                      ],
                    })),
                  }}
                  actions={
                    canEdit ? (
                      <Button
                        onClick={() => setAddingBuilding(true)}
                        size="sm"
                        type="button"
                      >
                        <Plus data-icon="inline-start" />
                        Add building
                      </Button>
                    ) : null
                  }
                  {...(canEdit
                    ? {
                        rowActions: Object.fromEntries(
                          buildings.map((building) => [
                            building.id,
                            <div
                              key={building.id}
                              className="flex justify-end gap-2"
                            >
                              <Button
                                onClick={() => setEditingBuilding(building)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => setAddingRoomTo(building.id)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Add Room
                              </Button>
                            </div>,
                          ]),
                        ),
                      }
                    : {})}
                />
                <RelatedRecordTable
                  table={{
                    id: "rooms",
                    title: "Rooms",
                    description: "Rooms grouped by their parent Building.",
                    columns: ["Room / code / status", "Building", "Notes"],
                    rows: buildings.flatMap((building) =>
                      building.rooms.map((room) => ({
                        id: room.id,
                        cells: [
                          [
                            room.code,
                            room.name,
                            room.isActive ? "Active" : "Archived",
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          building.name,
                          room.notes ?? "—",
                        ],
                      })),
                    ),
                  }}
                  {...(canEdit
                    ? {
                        firstCells: Object.fromEntries(
                          buildings.flatMap((building) =>
                            building.rooms.map((room) => [
                              room.id,
                              <RoomInlineEditor
                                key={room.id}
                                canEdit={canEdit}
                                room={room}
                              />,
                            ]),
                          ),
                        ),
                      }
                    : {})}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
