import "server-only";

import { getDatabase } from "@/lib/db";

export interface GlobalSearchResult {
  context: string;
  href: string;
  id: string;
  label: string;
  type: "Project" | "Building" | "Client" | "Supplier" | "Order" | "Item";
}

export async function globalSearch(
  query: string,
): Promise<GlobalSearchResult[]> {
  const database = getDatabase();
  const contains = { contains: query, mode: "insensitive" as const };
  const [projects, buildings, clients, suppliers, orders, items] =
    await Promise.all([
      database.project.findMany({
        where: { OR: [{ name: contains }, { code: contains }] },
        orderBy: { name: "asc" },
        select: {
          client: { select: { displayName: true } },
          code: true,
          id: true,
          name: true,
        },
        take: 8,
      }),
      database.building.findMany({
        where: { OR: [{ name: contains }, { shortCode: contains }] },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true } },
          shortCode: true,
        },
        take: 8,
      }),
      database.client.findMany({
        where: {
          OR: [
            { displayName: contains },
            { legalName: contains },
            { vatNumber: contains },
          ],
        },
        orderBy: { displayName: "asc" },
        select: { displayName: true, id: true, legalName: true },
        take: 8,
      }),
      database.supplier.findMany({
        where: {
          OR: [
            { displayName: contains },
            { legalName: contains },
            { vatNumber: contains },
          ],
        },
        orderBy: { displayName: "asc" },
        select: { displayName: true, id: true, legalName: true },
        take: 8,
      }),
      database.procurementOrder.findMany({
        where: {
          OR: [
            { orderNumber: contains },
            { packageName: contains },
            { supplierQuoteReference: contains },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          packageName: true,
          project: { select: { name: true } },
          supplier: { select: { displayName: true } },
        },
        take: 8,
      }),
      database.item.findMany({
        where: {
          OR: [
            { itemReference: contains },
            { name: contains },
            { description: contains },
            { supplierSku: contains },
            { supplier: { displayName: contains } },
            { room: { name: contains } },
            { building: { name: contains } },
            { project: { name: contains } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: {
          building: { select: { name: true } },
          id: true,
          itemReference: true,
          name: true,
          project: { select: { name: true } },
          room: { select: { name: true } },
          supplier: { select: { displayName: true } },
        },
        take: 12,
      }),
    ]);
  return [
    ...projects.map((project) => ({
      context: `${project.code} · ${project.client.displayName}`,
      href: `/projects/${project.id}`,
      id: project.id,
      label: project.name,
      type: "Project" as const,
    })),
    ...buildings.map((building) => ({
      context: `${building.shortCode} · ${building.project.name}`,
      href: `/projects/${building.project.id}#buildings`,
      id: building.id,
      label: building.name,
      type: "Building" as const,
    })),
    ...clients.map((client) => ({
      context: client.legalName,
      href: `/clients?query=${encodeURIComponent(client.displayName)}&active=all`,
      id: client.id,
      label: client.displayName,
      type: "Client" as const,
    })),
    ...suppliers.map((supplier) => ({
      context: supplier.legalName,
      href: `/suppliers?query=${encodeURIComponent(supplier.displayName)}&active=all`,
      id: supplier.id,
      label: supplier.displayName,
      type: "Supplier" as const,
    })),
    ...orders.map((order) => ({
      context: `${order.project.name} · ${order.supplier.displayName} · ${order.packageName}`,
      href: `/orders/${order.id}`,
      id: order.id,
      label: order.orderNumber,
      type: "Order" as const,
    })),
    ...items.map((item) => ({
      context: [
        item.project.name,
        item.building?.name,
        item.room?.name,
        item.supplier?.displayName,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/items/${item.id}`,
      id: item.id,
      label: item.itemReference
        ? `${item.itemReference} · ${item.name}`
        : item.name,
      type: "Item" as const,
    })),
  ];
}
