"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignPackageAction,
  savePackageAction,
} from "@/app/(app)/projects/package-actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PackageSelect, type PackageOption } from "./package-select";

export function PackageEditor({
  projectId,
  item,
}: {
  projectId: string;
  item?: PackageOption;
}) {
  const [open, setOpen] = useState(false);
  const { onSubmit, state, pending } = usePersistentActionState(
    savePackageAction,
    {},
  );
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {item ? "Edit Package" : "Create Package"}
      </Button>
      <EditorDrawer
        open={open}
        onOpenChange={setOpen}
        title={item ? "Edit Package" : "Create Package"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="id" value={item?.id ?? ""} />
          <Field label="Package name" error={state.fieldErrors?.name}>
            <input
              className={inputClassName}
              name="name"
              defaultValue={item?.name ?? ""}
              required
              maxLength={200}
            />
          </Field>
          {item ? (
            <Field label="Action">
              <select name="operation" className={inputClassName}>
                <option value="save">Save name</option>
                <option value={item.isActive ? "archive" : "restore"}>
                  {item.isActive ? "Archive (retain Orders)" : "Restore"}
                </option>
              </select>
            </Field>
          ) : null}
          <p className="text-muted-foreground text-sm">
            Archiving retains every Order assignment. Archived Packages cannot
            receive new Orders.
          </p>
          <ActionFeedback state={state} />
          <div className="flex gap-2">
            <SubmitButton pending={pending}>Save</SubmitButton>
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </SheetClose>
          </div>
        </form>
      </EditorDrawer>
    </>
  );
}

export function PackageAssignment({
  projectId,
  orderId,
  currentPackageId,
  packages,
}: {
  projectId: string;
  orderId: string;
  currentPackageId: string | null;
  packages: PackageOption[];
}) {
  const [packageId, setPackageId] = useState(currentPackageId ?? "");
  const router = useRouter();
  const { onSubmit, state, pending } = usePersistentActionState(
    async (previous, data) => {
      const result = await assignPackageAction(previous, data);
      if (result.status === "success") router.refresh();
      return result;
    },
    {},
  );
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input name="orderId" type="hidden" value={orderId} />
      <input name="projectId" type="hidden" value={projectId} />
      <PackageSelect
        projectId={projectId}
        packages={packages}
        value={packageId}
        onChange={setPackageId}
      />
      <SubmitButton pending={pending}>Save assignment</SubmitButton>
      <ActionFeedback state={state} />
    </form>
  );
}
