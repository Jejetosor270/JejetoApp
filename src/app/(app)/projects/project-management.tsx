"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { updateProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import {
  createProjectAction,
  deleteSelectedProjectsAction,
} from "@/app/(app)/projects/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineEditActions,
  InlinePercentInput,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { countries, countryLabel } from "@/config/countries";
import { rateToPercentInput } from "@/domain/procurement/presentation";

interface ClientOption {
  displayName: string;
  id: string;
}
interface CurrencyOption {
  code: string;
  name: string;
}
interface ManagerOption {
  id: string;
  name: string;
}
interface ProjectView {
  _count: { buildings: number; orders: number };
  client: ClientOption;
  clientId: string;
  code: string;
  countryCode: string | null;
  clientBudgetTargetHt: string | null;
  defaultFreightMarkupRate: string;
  defaultOtherCostMarkupRate: string;
  defaultProductMarkupRate: string;
  estimatedFreightCostHt: string | null;
  estimatedPurchaseCostHt: string | null;
  expectedSellHt: string | null;
  expectedCompletionDate: string | null;
  freightEstimateNotes: string | null;
  freightEstimateRate: string | null;
  id: string;
  name: string;
  notes: string | null;
  projectManager: ManagerOption | null;
  projectManagerId: string | null;
  reportingCurrencyCode: string;
  startDate: string | null;
  status: string;
  targetMarkupRate: string | null;
  targetMode: string;
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  PLANNING: "Planning",
};
function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";
}

function CreateProjectForm({
  clients,
  currencies,
  managers,
  statuses,
}: {
  clients: ClientOption[];
  currencies: CurrencyOption[];
  managers: ManagerOption[];
  statuses: string[];
}) {
  const [state, action, pending] = useActionState(
    createProjectAction,
    initialMasterDataActionState,
  );
  return (
    <details className="bg-card rounded-lg border">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" /> Add project
        </span>
      </summary>
      <form
        action={action}
        className="grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <Field label="Project name">
          <input className={inputClassName} name="name" required />
        </Field>
        <Field label="Project code">
          <input className={inputClassName} name="code" required />
        </Field>
        <Field label="Client">
          <select className={inputClassName} name="clientId" required>
            <option value="">Choose a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Country">
          <select className={inputClassName} name="countryCode">
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
            name="reportingCurrencyCode"
            required
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project manager">
          <select className={inputClassName} name="projectManagerId">
            <option value="">Not assigned</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input className={inputClassName} name="startDate" type="date" />
        </Field>
        <Field label="Expected completion">
          <input
            className={inputClassName}
            name="expectedCompletionDate"
            type="date"
          />
        </Field>
        <Field label="Status">
          <select
            className={inputClassName}
            defaultValue="PLANNING"
            name="status"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status] ?? status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default Product Markup %">
          <input
            className={inputClassName}
            defaultValue="0"
            inputMode="decimal"
            name="defaultProductMarkupRate"
          />
        </Field>
        <Field label="Default Freight Markup %">
          <input
            className={inputClassName}
            defaultValue="0"
            inputMode="decimal"
            name="defaultFreightMarkupRate"
          />
        </Field>
        <input name="defaultOtherCostMarkupRate" type="hidden" value="0" />
        <label className="grid gap-1.5 text-sm font-medium md:col-span-2 xl:col-span-3">
          Notes
          <textarea className={`${inputClassName} h-20 py-2`} name="notes" />
        </label>
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>Create project</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </details>
  );
}

function ProjectInlineRow({
  canEdit,
  isSelected,
  onSelect,
  project,
  statuses,
}: {
  canEdit: boolean;
  isSelected: boolean;
  onSelect: () => void;
  project: ProjectView;
  statuses: string[];
}) {
  const initial = () => ({
    code: project.code,
    countryCode: project.countryCode ?? "",
    freightEstimateRate: rateToPercentInput(project.freightEstimateRate),
    name: project.name,
    status: project.status,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (field: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = () => {
    const data = new FormData();
    Object.entries({
      clientId: project.clientId,
      clientBudgetTargetHt: project.clientBudgetTargetHt ?? "",
      code: draft.code,
      countryCode: draft.countryCode,
      defaultFreightMarkupRate: rateToPercentInput(
        project.defaultFreightMarkupRate,
      ),
      defaultOtherCostMarkupRate: rateToPercentInput(
        project.defaultOtherCostMarkupRate,
      ),
      defaultProductMarkupRate: rateToPercentInput(
        project.defaultProductMarkupRate,
      ),
      estimatedFreightCostHt: project.estimatedFreightCostHt ?? "",
      estimatedPurchaseCostHt: project.estimatedPurchaseCostHt ?? "",
      expectedSellHt: project.expectedSellHt ?? "",
      expectedCompletionDate: project.expectedCompletionDate ?? "",
      freightEstimateNotes: project.freightEstimateNotes ?? "",
      freightEstimateRate: draft.freightEstimateRate,
      id: project.id,
      name: draft.name,
      notes: project.notes ?? "",
      projectManagerId: project.projectManagerId ?? "",
      reportingCurrencyCode: project.reportingCurrencyCode,
      startDate: project.startDate ?? "",
      status: draft.status,
      targetMarkupRate: rateToPercentInput(project.targetMarkupRate),
      targetMode: project.targetMode,
    }).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      const result = await updateProjectAction(
        initialMasterDataActionState,
        data,
      );
      setFeedback(result.message ?? "");
      if (result.status === "success") {
        setSaved(draft);
        setEditing(false);
      }
    });
  };
  return (
    <tr className="hover:bg-muted/25 align-top">
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={`Project ${saved.name}`}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3 font-medium">
        {editing ? (
          <InlineTextInput
            ariaLabel="Project name"
            onChange={(value) => set("name", value)}
            value={draft.name}
          />
        ) : (
          <Link
            className="hover:text-primary underline-offset-4 hover:underline"
            href={`/projects/${project.id}`}
          >
            {saved.name}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {editing ? (
          <InlineTextInput
            ariaLabel="Project code"
            onChange={(value) => set("code", value)}
            value={draft.code}
          />
        ) : (
          saved.code
        )}
      </td>
      <td className="px-4 py-3">{project.client.displayName}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineSelect
            ariaLabel="Project country"
            onChange={(value) => set("countryCode", value)}
            value={draft.countryCode}
          >
            <option value="">Not specified</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </InlineSelect>
        ) : (
          countryLabel(saved.countryCode)
        )}
      </td>
      <td className="px-4 py-3 font-mono">{project.reportingCurrencyCode}</td>
      <td className="px-4 py-3">{project.projectManager?.name ?? "—"}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineSelect
            ariaLabel="Project status"
            onChange={(value) => set("status", value)}
            value={draft.status}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status] ?? status}
              </option>
            ))}
          </InlineSelect>
        ) : (
          (statusLabels[saved.status] ?? saved.status)
        )}
      </td>
      <td className="px-4 py-3">{dateLabel(project.expectedCompletionDate)}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlinePercentInput
            ariaLabel="Project freight estimate percentage"
            onChange={(value) => set("freightEstimateRate", value)}
            value={draft.freightEstimateRate}
          />
        ) : saved.freightEstimateRate ? (
          `${saved.freightEstimateRate}%`
        ) : (
          "—"
        )}
      </td>
      {canEdit ? (
        <td className="px-4 py-3">
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
        </td>
      ) : null}
    </tr>
  );
}

export function ProjectManagement({
  canEdit,
  clients,
  currencies,
  managers,
  projects,
  statuses,
}: {
  canEdit: boolean;
  clients: ClientOption[];
  currencies: CurrencyOption[];
  managers: ManagerOption[];
  projects: ProjectView[];
  statuses: string[];
}) {
  const selection = useBulkSelection(projects.map((project) => project.id));
  const selectedProjects = projects.filter((project) =>
    selection.selectedIds.includes(project.id),
  );
  const affectedBuildingCount = selectedProjects.reduce(
    (total, project) => total + project._count.buildings,
    0,
  );
  const affectedOrderCount = selectedProjects.reduce(
    (total, project) => total + project._count.orders,
    0,
  );
  return (
    <div className="space-y-5">
      {canEdit ? (
        <CreateProjectForm
          clients={clients}
          currencies={currencies}
          managers={managers}
          statuses={statuses}
        />
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        {canEdit ? (
          <BulkActionBar
            action={deleteSelectedProjectsAction}
            clearSelection={selection.clear}
            entityName="Project"
            impactSummary={`${affectedBuildingCount} Building${affectedBuildingCount === 1 ? "" : "s"} and ${affectedOrderCount} Procurement Order${affectedOrderCount === 1 ? "" : "s"} will also be deleted.`}
            scope="Deleting the selected Projects will also permanently delete their Buildings, Procurement Orders, payments, settlements, quote-import history, and financial records. Clients and Suppliers are preserved."
            selectedIds={selection.selectedIds}
          />
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                {canEdit ? (
                  <SelectionHeader
                    checked={selection.allSelected}
                    disabled={projects.length === 0}
                    onChange={selection.toggleAll}
                  />
                ) : null}
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Project manager</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expected completion</th>
                <th className="px-4 py-3">Freight estimate</th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">Edit</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map((project) => (
                <ProjectInlineRow
                  canEdit={canEdit}
                  isSelected={selection.isSelected(project.id)}
                  key={project.id}
                  onSelect={() => selection.toggle(project.id)}
                  project={project}
                  statuses={statuses}
                />
              ))}
            </tbody>
          </table>
        </div>
        {projects.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-sm">
            No projects yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
