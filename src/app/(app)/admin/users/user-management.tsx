"use client";

import { hasUnsavedDrafts } from "@/components/forms/draft-guard";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { KeyRound, LoaderCircle, Plus, UserCog } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createEmployeeAction,
  deleteSelectedEmployeesAction,
  resetEmployeePasswordAction,
  updateEmployeeAction,
} from "@/app/(app)/admin/users/actions";
import {
  initialUserActionState,
  type UpdatedEmployeeActionData,
} from "@/app/(app)/admin/users/action-state";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { minimumPasswordLength } from "@/domain/users/password-policy";
import { formatRoleLabel } from "@/domain/presentation/labels";
import { formatTimestampDate } from "@/domain/payments/dates";
import { useRouter } from "next/navigation";

type EmployeeRole = "ADMIN" | "MANAGER" | "USER";

interface EmployeeView {
  createdAt: string;
  email: string;
  id: string;
  isActive: boolean;
  name: string;
  role: EmployeeRole;
  updatedAt: string;
}

const inputClassName =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function ActionFeedback({
  message,
  status,
}: {
  message?: string | undefined;
  status?: "error" | "success" | undefined;
}) {
  if (!message || !status) {
    return null;
  }

  return (
    <p
      className={
        status === "error"
          ? "text-destructive text-sm"
          : "text-positive text-sm"
      }
      role={status === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function CreateEmployeeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    state,
    onSubmit,
    pending: isPending,
  } = usePersistentActionState(createEmployeeAction, initialUserActionState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <section
      aria-labelledby="create-employee-heading"
      className="bg-card rounded-lg border p-4 sm:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
          <Plus aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 id="create-employee-heading" className="text-sm font-semibold">
            Create employee account
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Accounts are internal only. The employee sets no account up
            publicly.
          </p>
        </div>
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-2"
        ref={formRef}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          Name
          <input className={inputClassName} name="name" required />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input
            autoComplete="off"
            className={inputClassName}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Initial password
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={minimumPasswordLength}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Role
          <select className={inputClassName} defaultValue="USER" name="role">
            <option value="USER">User</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        <div className="flex items-end gap-3 xl:col-span-2">
          <Button disabled={isPending} type="submit">
            {isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Plus aria-hidden="true" data-icon="inline-start" />
            )}
            Create account
          </Button>
          <ActionFeedback message={state.message} status={state.status} />
        </div>
      </form>
    </section>
  );
}

function EditEmployeeForm({
  employee,
  onClose,
  onUpdated,
}: {
  employee: EmployeeView;
  onClose: () => void;
  onUpdated: (employee: UpdatedEmployeeActionData) => void;
}) {
  const router = useRouter();
  const {
    state,
    onSubmit,
    pending: isPending,
  } = usePersistentActionState(updateEmployeeAction, initialUserActionState);

  useEffect(() => {
    if (state.status === "success" && state.employee) {
      onUpdated(state.employee);
      router.refresh();
    }
  }, [onUpdated, router, state.employee, state.status]);

  return (
    <section
      aria-labelledby="edit-employee-heading"
      className="bg-card rounded-lg border p-4 sm:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="bg-muted text-foreground flex size-8 items-center justify-center rounded-md">
            <UserCog aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 id="edit-employee-heading" className="text-sm font-semibold">
              Edit employee account
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Update account details separately from password changes.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            if (
              !hasUnsavedDrafts() ||
              window.confirm("Discard your unsaved employee changes?")
            )
              onClose();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Close
        </Button>
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-2"
      >
        <input name="id" type="hidden" value={employee.id} />
        <label className="grid gap-1.5 text-sm font-medium">
          Name
          <input
            className={inputClassName}
            defaultValue={employee.name}
            name="name"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input
            className={inputClassName}
            defaultValue={employee.email}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Role
          <select
            className={inputClassName}
            defaultValue={employee.role}
            name="role"
          >
            <option value="USER">User</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 self-end text-sm font-medium">
          <input
            className="accent-primary size-4"
            defaultChecked={employee.isActive}
            name="isActive"
            type="checkbox"
          />
          Account active
        </label>
        <div className="flex items-center gap-3 md:col-span-2 xl:col-span-2">
          <Button disabled={isPending} type="submit">
            {isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : null}
            Save changes
          </Button>
          <ActionFeedback message={state.message} status={state.status} />
        </div>
      </form>
      <PasswordResetForm employeeId={employee.id} />
    </section>
  );
}

function PasswordResetForm({ employeeId }: { employeeId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    state,
    onSubmit,
    pending: isPending,
  } = usePersistentActionState(
    resetEmployeePasswordAction,
    initialUserActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <section
      className="bg-muted/30 mt-5 border-t pt-5"
      aria-labelledby="password-reset-heading"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="bg-background text-foreground flex size-8 items-center justify-center rounded-md border">
          <KeyRound aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h3 id="password-reset-heading" className="text-sm font-semibold">
            Change password
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Set a new password for this employee. The current password is never
            displayed.
          </p>
        </div>
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-2"
        ref={formRef}
      >
        <input name="id" type="hidden" value={employeeId} />
        <label className="grid gap-1.5 text-sm font-medium">
          New password
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={minimumPasswordLength}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Confirm new password
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={minimumPasswordLength}
            name="passwordConfirmation"
            required
            type="password"
          />
        </label>
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-2">
          <Button disabled={isPending} type="submit" variant="outline">
            {isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <KeyRound aria-hidden="true" data-icon="inline-start" />
            )}
            Update password
          </Button>
          <ActionFeedback message={state.message} status={state.status} />
        </div>
      </form>
    </section>
  );
}

function EmployeeInlineRow({
  currentAdministratorId,
  employee,
  isSelected,
  onFullEdit,
  onSelect,
}: {
  currentAdministratorId: string;
  employee: EmployeeView;
  isSelected: boolean;
  onFullEdit: () => void;
  onSelect: () => void;
  onUpdated: (employee: UpdatedEmployeeActionData) => void;
}) {
  return (
    <tr className="hover:bg-muted/40">
      <SelectionCell
        checked={isSelected}
        disabled={employee.id === currentAdministratorId}
        label={employee.name}
        onChange={onSelect}
      />
      <td className="px-4 py-3 font-medium">
        {employee.name}
        {employee.id === currentAdministratorId && (
          <span className="text-muted-foreground ml-2 text-xs">You</span>
        )}
      </td>
      <td className="px-4 py-3">{employee.email}</td>
      <td className="px-4 py-3">{formatRoleLabel(employee.role)}</td>
      <td className="px-4 py-3">{employee.isActive ? "Active" : "Inactive"}</td>
      <td className="px-4 py-3 text-xs">
        {formatTimestampDate(employee.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Button type="button" variant="outline" size="sm" onClick={onFullEdit}>
          Manage account
        </Button>
      </td>
    </tr>
  );
}

export function UserManagement({
  currentAdministratorId,
  employees,
}: {
  currentAdministratorId: string;
  employees: EmployeeView[];
}) {
  const [displayedEmployees, setDisplayedEmployees] = useState(employees);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeView | null>(
    null,
  );
  const selection = useBulkSelection(
    displayedEmployees
      .filter((employee) => employee.id !== currentAdministratorId)
      .map((employee) => employee.id),
  );
  const selectedEmployees = displayedEmployees.filter((employee) =>
    selection.selectedIds.includes(employee.id),
  );
  const clearDeletedEmployees = () => {
    const deletedIds = new Set(selection.selectedIds);
    setDisplayedEmployees((current) =>
      current.filter((employee) => !deletedIds.has(employee.id)),
    );
    setEditingEmployee((current) =>
      current && deletedIds.has(current.id) ? null : current,
    );
    selection.clear();
  };

  const handleEmployeeUpdated = useCallback(
    (updatedEmployee: UpdatedEmployeeActionData) => {
      setDisplayedEmployees((currentEmployees) =>
        currentEmployees.map((employee) =>
          employee.id === updatedEmployee.id
            ? { ...employee, ...updatedEmployee }
            : employee,
        ),
      );
      setEditingEmployee((currentEmployee) =>
        currentEmployee?.id === updatedEmployee.id
          ? { ...currentEmployee, ...updatedEmployee }
          : currentEmployee,
      );
    },
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee accounts"
        description="Manage internal accounts and access permissions."
        actions={
          <>
            <Badge className="w-fit" variant="outline">
              {
                displayedEmployees.filter((employee) => employee.isActive)
                  .length
              }{" "}
              active
            </Badge>
            <EditorDrawer
              title="Create employee"
              trigger={<Button>Create employee</Button>}
            >
              <CreateEmployeeForm />
            </EditorDrawer>
          </>
        }
      />

      {editingEmployee ? (
        <EditorDrawer
          open
          title="Manage employee"
          onOpenChange={(open) => {
            if (!open) setEditingEmployee(null);
          }}
        >
          {" "}
          <EditEmployeeForm
            employee={editingEmployee}
            onClose={() => setEditingEmployee(null)}
            onUpdated={handleEmployeeUpdated}
          />
        </EditorDrawer>
      ) : null}

      <section
        aria-labelledby="employee-list-heading"
        className="bg-card overflow-hidden rounded-lg border"
      >
        <div className="border-b px-4 py-3.5 sm:px-5">
          <h2 id="employee-list-heading" className="text-sm font-semibold">
            Internal users
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Inactive accounts remain available for historical attribution but
            cannot sign in.
          </p>
        </div>
        <BulkActionBar
          permanent
          action={deleteSelectedEmployeesAction}
          clearSelection={clearDeletedEmployees}
          entityName="employee"
          impactSummary={`Selected: ${selectedEmployees.map((employee) => employee.name).join(", ")}`}
          scope="The selected employees will immediately lose application access. Historical operational and audit records will be preserved."
          selectedIds={selection.selectedIds}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[43rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs font-medium">
              <tr>
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={displayedEmployees.length === 0}
                  onChange={selection.toggleAll}
                />
                <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedEmployees.map((employee) => (
                <EmployeeInlineRow
                  currentAdministratorId={currentAdministratorId}
                  employee={employee}
                  isSelected={selection.isSelected(employee.id)}
                  key={employee.id}
                  onFullEdit={() => setEditingEmployee(employee)}
                  onSelect={() => selection.toggle(employee.id)}
                  onUpdated={handleEmployeeUpdated}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
