import "server-only";

import Decimal from "decimal.js";

import {
  ItemCommercialStatus,
  ItemSourceType,
  Prisma,
  PricingMode,
} from "@/generated/prisma/client";
import {
  normalizeImportText,
  proposedRoomCode,
  proposedRoomName,
  rowWarnings,
  type BudgetReviewRow,
} from "@/domain/items/import";
import { normalizeSupplierName } from "@/domain/quote-intake/supplier-matching";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";
import { normalizeDecimalInput } from "@/domain/validation/numeric";
import type { ParsedBudgetWorkbook } from "@/lib/items/xlsx";

function text(value: string | undefined, max: number): string | null {
  const result = value?.trim();
  return result ? result.slice(0, max) : null;
}
function decimalValue(value: string | undefined, rate = false): string | null {
  if (!value) return null;
  const includesPercent = value.trim().endsWith("%");
  const cleaned = value.trim().replace(/[€£$]/g, "").replace(/%$/, "");
  try {
    const normalizedInput = normalizeDecimalInput(cleaned, {
      allowNegative: false,
      maximumDecimalPlaces: 10,
    });
    if (!normalizedInput) return null;
    const decimal = new Decimal(normalizedInput);
    if (decimal.isNegative() || !decimal.isFinite()) return null;
    const normalized =
      rate && (includesPercent || decimal.greaterThan(1))
        ? decimal.dividedBy(100)
        : decimal;
    return normalized.toDecimalPlaces(rate ? 6 : 4).toFixed(rate ? 6 : 4);
  } catch {
    return null;
  }
}

interface ImportDefaults {
  buildingId: string | null;
  currencyCode: string | null;
  projectId: string;
  supplierId: string | null;
}

export async function prepareBudgetReview(
  workbook: ParsedBudgetWorkbook,
  defaults: ImportDefaults,
) {
  const database = getDatabase();
  const [suppliers, buildings, existing] = await Promise.all([
    database.supplier.findMany({
      where: { isActive: true },
      select: { displayName: true, id: true, legalName: true },
    }),
    database.building.findMany({
      where: { projectId: defaults.projectId },
      select: {
        id: true,
        name: true,
        shortCode: true,
        rooms: {
          where: { isActive: true },
          select: { code: true, id: true, name: true },
        },
      },
    }),
    database.item.findMany({
      where: {
        projectId: defaults.projectId,
        OR: [
          {
            sourceReference: {
              in: workbook.rows.flatMap((row) =>
                row.fields.itemReference
                  ? [row.fields.itemReference.slice(0, 120)]
                  : [],
              ),
            },
          },
          {
            itemReference: {
              in: workbook.rows.flatMap((row) =>
                row.fields.itemReference
                  ? [row.fields.itemReference.slice(0, 120)]
                  : [],
              ),
            },
          },
          {
            supplierSku: {
              in: workbook.rows.flatMap((row) =>
                row.fields.supplierSku
                  ? [row.fields.supplierSku.slice(0, 160)]
                  : [],
              ),
            },
          },
          {
            name: {
              in: workbook.rows.flatMap((row) =>
                row.fields.description
                  ? [row.fields.description.slice(0, 240)]
                  : [],
              ),
            },
          },
        ],
      },
      select: {
        buildingId: true,
        category: true,
        finishColor: true,
        id: true,
        itemReference: true,
        name: true,
        quantity: true,
        roomId: true,
        sourceReference: true,
        supplierId: true,
        supplierSku: true,
        totalPurchasePriceHt: true,
        totalSellingPriceHt: true,
        unitPurchasePriceHt: true,
        unitSellingPriceHt: true,
        vatRate: true,
      },
    }),
  ]);
  const supplierByName = new Map<string, string>();
  for (const supplier of suppliers)
    for (const name of [supplier.displayName, supplier.legalName]) {
      const key = normalizeSupplierName(name);
      if (key && !supplierByName.has(key)) supplierByName.set(key, supplier.id);
    }
  const defaultBuilding =
    buildings.find((building) => building.id === defaults.buildingId) ?? null;
  const rows: BudgetReviewRow[] = workbook.rows.map((source) => {
    const sourceReference = text(source.fields.itemReference, 120);
    const itemReference = sourceReference;
    const supplierName = text(source.fields.vendor, 200);
    const supplierId =
      defaults.supplierId ??
      (supplierName
        ? (supplierByName.get(normalizeSupplierName(supplierName) ?? "") ??
          null)
        : null);
    const area = text(source.fields.area, 160);
    const roomName = proposedRoomName(area);
    const roomCode = proposedRoomCode(area);
    let building = defaultBuilding;
    if (!building && area) {
      const key = normalizeImportText(area);
      building =
        buildings.find(
          (candidate) =>
            key?.includes(normalizeImportText(candidate.shortCode) ?? "___") ||
            key?.includes(normalizeImportText(candidate.name) ?? "___"),
        ) ?? null;
    }
    const room =
      roomName && building
        ? (building.rooms.find(
            (candidate) =>
              (roomCode && candidate.code === roomCode) ||
              normalizeImportText(candidate.name) ===
                normalizeImportText(roomName),
          ) ?? null)
        : null;
    const description =
      text(source.fields.description, 240) ?? itemReference ?? "";
    const quantity = decimalValue(source.fields.quantity);
    let unitPurchasePriceHt = decimalValue(source.fields.unitPurchasePriceHt);
    let totalPurchasePriceHt = decimalValue(source.fields.totalPurchasePriceHt);
    const markupRate = decimalValue(source.fields.markupRate, true);
    let unitSellingPriceHt = decimalValue(source.fields.unitSellingPriceHt);
    let totalSellingPriceHt = decimalValue(source.fields.totalSellingPriceHt);
    const quantityDecimal = quantity ? new Decimal(quantity) : null;
    if (quantityDecimal && !quantityDecimal.isZero()) {
      if (unitPurchasePriceHt && !totalPurchasePriceHt)
        totalPurchasePriceHt = quantityDecimal
          .times(unitPurchasePriceHt)
          .toDecimalPlaces(4)
          .toFixed(4);
      if (totalPurchasePriceHt && !unitPurchasePriceHt)
        unitPurchasePriceHt = new Decimal(totalPurchasePriceHt)
          .dividedBy(quantityDecimal)
          .toDecimalPlaces(4)
          .toFixed(4);
    }
    if (markupRate && !unitSellingPriceHt && unitPurchasePriceHt)
      unitSellingPriceHt = new Decimal(unitPurchasePriceHt)
        .times(new Decimal(1).plus(markupRate))
        .toDecimalPlaces(4)
        .toFixed(4);
    if (quantityDecimal && !quantityDecimal.isZero()) {
      if (unitSellingPriceHt && !totalSellingPriceHt)
        totalSellingPriceHt = quantityDecimal
          .times(unitSellingPriceHt)
          .toDecimalPlaces(4)
          .toFixed(4);
      if (totalSellingPriceHt && !unitSellingPriceHt)
        unitSellingPriceHt = new Decimal(totalSellingPriceHt)
          .dividedBy(quantityDecimal)
          .toDecimalPlaces(4)
          .toFixed(4);
    }
    if (markupRate && !totalSellingPriceHt && totalPurchasePriceHt)
      totalSellingPriceHt = new Decimal(totalPurchasePriceHt)
        .times(new Decimal(1).plus(markupRate))
        .toDecimalPlaces(4)
        .toFixed(4);
    const vatRate = decimalValue(source.fields.vatRate, true);
    const vatAmount =
      vatRate && (totalSellingPriceHt ?? totalPurchasePriceHt)
        ? new Decimal(totalSellingPriceHt ?? totalPurchasePriceHt ?? "0")
            .times(vatRate)
            .toDecimalPlaces(4)
            .toFixed(4)
        : null;
    const candidates = existing.filter((item) => {
      const sameLocation =
        item.buildingId === (building?.id ?? null) &&
        item.roomId === (room?.id ?? null);
      return (
        sameLocation &&
        ((sourceReference && item.sourceReference === sourceReference) ||
          (supplierId &&
            source.fields.supplierSku &&
            item.supplierId === supplierId &&
            item.supplierSku === source.fields.supplierSku) ||
          (itemReference && item.itemReference === itemReference) ||
          (normalizeImportText(item.name) ===
            normalizeImportText(description) &&
            item.supplierId === supplierId))
      );
    });
    const matched = candidates.length === 1 ? candidates[0]! : null;
    const fields = {
      brand: text(source.fields.brand, 160),
      buildingId: building?.id ?? null,
      category: text(source.fields.category, 80),
      commercialStatus: "BUDGET" as const,
      description,
      detailedDescription: null,
      finishColor: text(source.fields.finishColor, 240),
      itemReference,
      markupRate,
      notes: text(source.fields.notes, 4000),
      purchaseCurrencyCode: defaults.currencyCode,
      quantity,
      roomId: room?.id ?? null,
      sourceReference,
      supplierId,
      supplierName,
      supplierSku: text(source.fields.supplierSku, 160),
      totalPurchasePriceHt,
      totalSellingPriceHt,
      totalVolume: decimalValue(source.fields.totalVolume),
      totalWeight: decimalValue(source.fields.totalWeight),
      unitOfMeasure:
        text(source.fields.unitOfMeasure, 24)?.toUpperCase() ?? "EA",
      unitPurchasePriceHt,
      unitSellingPriceHt,
      vatAmount,
      vatRate,
      volumeEach: decimalValue(source.fields.volumeEach),
      weightEach: decimalValue(source.fields.weightEach),
    };
    const diffs = matched
      ? (
          [
            ["Quantity", matched.quantity.toString(), quantity],
            [
              "Unit purchase HT",
              matched.unitPurchasePriceHt?.toString() ?? null,
              unitPurchasePriceHt,
            ],
            [
              "Total purchase HT",
              matched.totalPurchasePriceHt?.toString() ?? null,
              totalPurchasePriceHt,
            ],
            [
              "Unit selling HT",
              matched.unitSellingPriceHt?.toString() ?? null,
              unitSellingPriceHt,
            ],
            [
              "Total selling HT",
              matched.totalSellingPriceHt?.toString() ?? null,
              totalSellingPriceHt,
            ],
            ["VAT rate", matched.vatRate?.toString() ?? null, vatRate],
            ["Finish", matched.finishColor, fields.finishColor],
            ["Supplier", matched.supplierId, supplierId],
            ["Building", matched.buildingId, fields.buildingId],
            ["Room", matched.roomId, fields.roomId],
          ] as Array<[string, string | null, string | null]>
        )
          .filter(([, before, after]) => before !== after)
          .map(([field, before, after]) => ({ after, before, field }))
      : [];
    const row: BudgetReviewRow = {
      action: matched ? "UPDATE" : "CREATE",
      diffs,
      existingItemId: matched?.id ?? null,
      include: true,
      matchStatus:
        candidates.length > 1 ? "CONFLICT" : matched ? "MATCHED" : "NEW",
      sourceRowNumber: source.rowNumber,
      sourceSheet: source.sheet.slice(0, 120),
      warnings: [],
      ...fields,
    };
    row.warnings = [
      ...rowWarnings(row),
      ...(!description && !itemReference
        ? ["Description or Item reference is required."]
        : []),
      ...(roomName && !room
        ? [`Room “${roomName}” not matched; choose or create it.`]
        : []),
      ...(candidates.length > 1
        ? ["Multiple existing Items match this row; resolve before import."]
        : []),
      ...(!quantity
        ? [
            source.fields.quantity
              ? "Quantity is invalid; enter a valid value."
              : "Quantity is required.",
          ]
        : []),
    ];
    if (row.matchStatus === "CONFLICT" || !description || !quantity) {
      row.include = false;
      row.action = "SKIP";
    }
    return row;
  });
  const duplicateGroups = new Map<string, BudgetReviewRow[]>();
  for (const row of rows) {
    const location = `${row.buildingId ?? ""}|${row.roomId ?? ""}`;
    const identity = row.sourceReference
      ? `reference|${row.sourceReference}|${location}`
      : row.supplierId && row.supplierSku
        ? `sku|${row.supplierId}|${row.supplierSku}|${location}`
        : `description|${normalizeImportText(row.description) ?? ""}|${row.supplierId ?? ""}|${location}`;
    const group = duplicateGroups.get(identity) ?? [];
    group.push(row);
    duplicateGroups.set(identity, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.action = "SKIP";
      row.include = false;
      row.matchStatus = "CONFLICT";
      row.warnings.push(
        "Duplicate Item identity appears more than once in this workbook; resolve before import.",
      );
    }
  }
  return {
    rows,
    summary: {
      conflicts: rows.filter((row) => row.matchStatus === "CONFLICT").length,
      creates: rows.filter((row) => row.action === "CREATE").length,
      detected: rows.length,
      updates: rows.filter((row) => row.action === "UPDATE").length,
      warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    },
  };
}

export async function confirmBudgetImport(
  actorId: string,
  input: import("@/domain/items/import").ConfirmBudgetImportInput,
) {
  const selected = input.rows.filter(
    (row) => row.include && row.action !== "SKIP",
  );
  return getDatabase().$transaction(
    async (transaction) => {
      const [project, buildings, rooms, suppliers, existing] =
        await Promise.all([
          transaction.project.findUnique({
            where: { id: input.projectId },
            select: { id: true },
          }),
          transaction.building.findMany({
            where: {
              id: {
                in: selected.flatMap((row) =>
                  row.buildingId ? [row.buildingId] : [],
                ),
              },
              projectId: input.projectId,
            },
            select: { id: true },
          }),
          transaction.room.findMany({
            where: {
              id: {
                in: selected.flatMap((row) => (row.roomId ? [row.roomId] : [])),
              },
            },
            select: { buildingId: true, id: true },
          }),
          transaction.supplier.findMany({
            where: {
              id: {
                in: selected.flatMap((row) =>
                  row.supplierId ? [row.supplierId] : [],
                ),
              },
              isActive: true,
            },
            select: { id: true },
          }),
          transaction.item.findMany({
            where: {
              id: {
                in: selected.flatMap((row) =>
                  row.existingItemId ? [row.existingItemId] : [],
                ),
              },
              projectId: input.projectId,
            },
            select: { id: true },
          }),
        ]);
      if (!project) throw new Error("The selected Project no longer exists.");
      const buildingIds = new Set(buildings.map((row) => row.id));
      const supplierIds = new Set(suppliers.map((row) => row.id));
      const existingIds = new Set(existing.map((row) => row.id));
      for (const row of selected) {
        if (row.buildingId && !buildingIds.has(row.buildingId))
          throw new Error(`Row ${row.sourceRowNumber}: invalid Building.`);
        if (
          row.roomId &&
          !rooms.some(
            (room) =>
              room.id === row.roomId && room.buildingId === row.buildingId,
          )
        )
          throw new Error(
            `Row ${row.sourceRowNumber}: invalid Room/Building relation.`,
          );
        if (row.supplierId && !supplierIds.has(row.supplierId))
          throw new Error(`Row ${row.sourceRowNumber}: invalid Supplier.`);
        if (
          row.action === "UPDATE" &&
          (!row.existingItemId || !existingIds.has(row.existingItemId))
        )
          throw new Error(
            `Row ${row.sourceRowNumber}: matched Item changed; refresh the import.`,
          );
      }
      const importRecord = await transaction.itemImport.create({
        data: {
          createdCount: selected.filter((row) => row.action === "CREATE")
            .length,
          extractionModel: input.extractionModel,
          extractionProvider: input.extractionProvider,
          importedById: actorId,
          mappingMetadata: input.mapping,
          originalFilename: input.filename,
          projectId: input.projectId,
          rowCount: input.rows.length,
          skippedCount: input.rows.length - selected.length,
          sourceType: ItemSourceType.BUDGET_XLSX,
          updatedCount: selected.filter((row) => row.action === "UPDATE")
            .length,
          warningCount: selected.reduce(
            (sum, row) => sum + row.warnings.length,
            0,
          ),
        },
      });
      for (const row of selected) {
        const data = {
          brand: row.brand,
          budgetPurchaseTotalPriceHt: row.totalPurchasePriceHt,
          budgetPurchaseUnitPriceHt: row.unitPurchasePriceHt,
          buildingId: row.buildingId,
          category: row.category,
          commercialStatus: ItemCommercialStatus.BUDGET,
          description: row.detailedDescription,
          finishColor: row.finishColor,
          importId: importRecord.id,
          itemReference: row.itemReference,
          name: row.description,
          notes: row.notes,
          pricingMode: PricingMode.SELLING_PRICE,
          projectId: input.projectId,
          purchaseCurrencyCode: row.purchaseCurrencyCode,
          quantity: row.quantity ?? "1.0000",
          roomId: row.roomId,
          sourceReference: row.sourceReference,
          sourceRowNumber: row.sourceRowNumber,
          sourceSheet: row.sourceSheet,
          sourceType: ItemSourceType.BUDGET_XLSX,
          supplierId: row.supplierId,
          supplierSku: row.supplierSku,
          totalPurchasePriceHt: row.totalPurchasePriceHt,
          totalSellingPriceHt: row.totalSellingPriceHt,
          totalVolume: row.totalVolume,
          totalWeight: row.totalWeight,
          unitOfMeasure: row.unitOfMeasure ?? "EA",
          unitPurchasePriceHt: row.unitPurchasePriceHt,
          unitSellingPriceHt: row.unitSellingPriceHt,
          updatedById: actorId,
          vatAmount: row.vatAmount,
          vatRate: row.vatRate,
          volumeEach: row.volumeEach,
          weightEach: row.weightEach,
        };
        if (row.action === "UPDATE" && row.existingItemId)
          await transaction.item.update({
            where: { id: row.existingItemId },
            data,
          });
        else
          await transaction.item.create({
            data: { ...data, createdById: actorId },
          });
      }
      await writeAuditEvent(transaction, actorId, {
        action: "IMPORTED",
        entityId: importRecord.id,
        entityReference: input.filename,
        entityType: "ITEM_IMPORT",
        metadata: {
          created: importRecord.createdCount,
          skipped: importRecord.skippedCount,
          updated: importRecord.updatedCount,
        },
        summary: "Confirmed a reviewed Project budget Item import.",
      });
      return {
        created: importRecord.createdCount,
        importId: importRecord.id,
        skipped: importRecord.skippedCount,
        updated: importRecord.updatedCount,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    },
  );
}
