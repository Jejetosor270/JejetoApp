import { modelMap } from "./model-map";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
}
/** Owned supporting records stay normalized, and follow their parent's visibility. */
const owners: Record<string, string[]> = {
  ProcurementOrderBuilding: ["order", "building"],
  ProcurementOrderCostLine: ["order"],
  ProcurementOrderVatEntry: ["order"],
  SupplierQuoteImport: ["order", "project", "supplier"],
  ClientBillingAllocation: ["billingDocument", "order"],
  ClientDocumentImport: ["billingDocument"],
  ItemImport: ["project"],
};
export function activeWhere(model: string): ObjectValue {
  const metadata = modelMap[model];
  if (metadata?.trash) return { trashedAt: null };
  return Object.fromEntries(
    (owners[model] ?? []).map((name) => [name, { trashedAt: null }]),
  );
}
function conditions(model: string, input: unknown): ObjectValue {
  const result = { ...object(input) };
  for (const [key, value] of Object.entries(result)) {
    if (["AND", "OR", "NOT"].includes(key)) {
      result[key] = Array.isArray(value)
        ? value.map((part) => conditions(model, part))
        : conditions(model, value);
      continue;
    }
    const relation = modelMap[model]?.relations[key];
    if (!relation || value === null) continue;
    const filter = object(value);
    if (relation.many) {
      result[key] = Object.fromEntries(
        Object.entries(filter).map(([operator, child]) => [
          operator,
          operator === "every"
            ? {
                OR: [
                  { NOT: activeWhere(relation.model) },
                  conditions(relation.model, child),
                ],
              }
            : visibleWhere(relation.model, child),
        ]),
      );
    } else if ("is" in filter || "isNot" in filter) {
      result[key] = Object.fromEntries(
        Object.entries(filter).map(([operator, child]) => [
          operator,
          child === null ? null : visibleWhere(relation.model, child),
        ]),
      );
    } else result[key] = visibleWhere(relation.model, filter);
  }
  return result;
}
function visibleWhere(model: string, input: unknown): ObjectValue {
  const where = conditions(model, input);
  const active = activeWhere(model);
  return Object.keys(active).length
    ? {
        ...where,
        AND: [
          ...(Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : []),
          active,
        ],
      }
    : where;
}
function projection(model: string, input: unknown): ObjectValue {
  const result = { ...object(input) };
  for (const [name, value] of Object.entries(result)) {
    if (!value) continue;
    if (name === "_count") {
      const selected =
        value === true
          ? Object.fromEntries(
              Object.entries(modelMap[model]?.relations ?? {})
                .filter(([, r]) => r.many)
                .map(([key]) => [key, true]),
            )
          : object(object(value).select);
      result[name] = {
        select: Object.fromEntries(
          Object.entries(selected).map(([key, choice]) => {
            const target = modelMap[model]?.relations[key];
            return [
              key,
              !choice || !target
                ? choice
                : {
                    ...object(choice),
                    where: visibleWhere(target.model, object(choice).where),
                  },
            ];
          }),
        ),
      };
      continue;
    }
    const relation = modelMap[model]?.relations[name];
    if (!relation) continue;
    const args = value === true ? {} : object(value);
    // Required to-one includes cannot take a where clause. Parent trashing includes
    // owned descendants; optional historical links remain intact for restoration.
    result[name] = {
      ...args,
      ...(relation.many
        ? { where: visibleWhere(relation.model, args.where) }
        : {}),
      ...(args.include
        ? { include: projection(relation.model, args.include) }
        : {}),
      ...(args.select
        ? { select: projection(relation.model, args.select) }
        : {}),
    };
  }
  return result;
}
/** One policy covers lists, financial aggregates, nested records and mutation targets. */
export function visibleQuery(
  model: string,
  operation: string,
  input: unknown,
): ObjectValue {
  const args = { ...object(input) };
  const scoped = [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
    "update",
    "updateMany",
    "updateManyAndReturn",
    "delete",
    "deleteMany",
    "upsert",
  ];
  if (scoped.includes(operation)) args.where = visibleWhere(model, args.where);
  if (args.include) args.include = projection(model, args.include);
  if (args.select) args.select = projection(model, args.select);
  return args;
}
