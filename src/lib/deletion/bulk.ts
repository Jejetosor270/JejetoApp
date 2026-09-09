import "server-only";
import { moveToTrash } from "@/lib/trash/service";
export { TrashError as BulkDeletionError } from "@/lib/trash/service";
export async function deleteOrders(
  actorId: string,
  ids: string[],
): Promise<void> {
  await moveToTrash(actorId, "ProcurementOrder", ids);
}
export async function deleteInstallments(
  actorId: string,
  ids: string[],
): Promise<void> {
  await moveToTrash(actorId, "PaymentInstallment", ids);
}
export async function deleteSuppliers(
  actorId: string,
  ids: string[],
): Promise<void> {
  await moveToTrash(actorId, "Supplier", ids);
}
export async function deleteProjects(
  actorId: string,
  ids: string[],
): Promise<void> {
  await moveToTrash(actorId, "Project", ids);
}
export async function deleteClients(
  actorId: string,
  ids: string[],
): Promise<void> {
  await moveToTrash(actorId, "Client", ids);
}
