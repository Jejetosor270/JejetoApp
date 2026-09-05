import "server-only";
import type { z } from "zod";
import type {
  packageInputSchema,
  packageAssignmentSchema,
} from "@/domain/packages/validation";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";

export class PackageValidationError extends Error {}

export async function savePackage(
  actorId: string,
  input: z.infer<typeof packageInputSchema>,
) {
  return getDatabase().$transaction(async (tx) => {
    // Serialize Project package naming and assignments, including archive races.
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${input.projectId}::uuid FOR UPDATE`;
    if (!(await tx.project.findUnique({ where: { id: input.projectId } })))
      throw new PackageValidationError("Project not found.");
    const current = input.id
      ? await tx.orderPackage.findFirst({
          where: { id: input.id, projectId: input.projectId },
        })
      : null;
    if (input.id && !current)
      throw new PackageValidationError("Package not found in this Project.");
    if (!current && input.operation !== "save")
      throw new PackageValidationError("Choose a Package first.");
    if (
      input.operation === "save" &&
      (await tx.orderPackage.findFirst({
        where: {
          projectId: input.projectId,
          name: { equals: input.name, mode: "insensitive" },
          ...(current ? { id: { not: current.id } } : {}),
        },
      }))
    )
      throw new PackageValidationError(
        "This Project already has a Package with this name.",
      );
    const saved = current
      ? await tx.orderPackage.update({
          where: { id: current.id },
          data: {
            ...(input.operation === "save"
              ? { name: input.name }
              : { isActive: input.operation === "restore" }),
            updatedById: actorId,
          },
        })
      : await tx.orderPackage.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            createdById: actorId,
            updatedById: actorId,
          },
        });
    await writeAuditEvent(tx, actorId, {
      action: !current
        ? "CREATED"
        : input.operation === "archive"
          ? "ARCHIVED"
          : "UPDATED",
      entityType: "ORDER_PACKAGE",
      entityId: saved.id,
      entityReference: saved.name,
      summary: "Project Package updated; existing Order assignments retained.",
      metadata: {
        projectId: input.projectId,
        previousName: current?.name ?? null,
        isActive: saved.isActive,
      },
    });
    return { id: saved.id, name: saved.name, isActive: saved.isActive };
  });
}

export async function assignPackage(
  actorId: string,
  input: z.infer<typeof packageAssignmentSchema>,
) {
  return getDatabase().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${input.projectId}::uuid FOR UPDATE`;
    const order = await tx.procurementOrder.findFirst({
      where: { id: input.orderId, projectId: input.projectId },
    });
    if (!order)
      throw new PackageValidationError("Order not found in this Project.");
    const target = input.packageId
      ? await tx.orderPackage.findFirst({
          where: {
            id: input.packageId,
            projectId: input.projectId,
            isActive: true,
          },
        })
      : null;
    if (input.packageId && !target)
      throw new PackageValidationError(
        "Choose an active Package in this Project.",
      );
    await tx.procurementOrder.update({
      where: { id: order.id },
      data: { packageId: input.packageId, updatedById: actorId },
    });
    await writeAuditEvent(tx, actorId, {
      action: "UPDATED",
      entityType: "ORDER",
      entityId: order.id,
      entityReference: order.orderNumber,
      summary: target
        ? `Assigned to Package ${target.name}.`
        : "Package assignment removed.",
      metadata: {
        previousPackageId: order.packageId,
        packageId: input.packageId,
        projectId: input.projectId,
      },
    });
  });
}
