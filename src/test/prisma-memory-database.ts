import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  ColumnTypeEnum as Type,
  type ColumnType,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
} from "@prisma/driver-adapter-utils";
import { PrismaClient } from "@/generated/prisma/client";
import { visibleQuery } from "@/lib/trash/visibility";

/** Real Prisma queries against disposable PostgreSQL; no connection strings or live data. */
export async function prismaMemoryDatabase() {
  const pg = new PGlite({
    parsers: { 1114: (value) => new Date(value.replace(" ", "T") + "Z") },
  });
  for (const name of readdirSync("prisma/migrations")
    .filter((name) => /^\d/.test(name))
    .sort()) {
    let sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
    // Enum additions must commit before a later statement can use the new value.
    for (const statement of sql.match(/ALTER TYPE[^;]+ADD VALUE[^;]+;/g) ??
      []) {
      await pg.exec(statement);
      sql = sql.replace(statement, "");
    }
    await pg.exec(sql);
  }
  const types: Record<number, ColumnType> = {
    16: Type.Boolean,
    20: Type.Int64,
    21: Type.Int32,
    23: Type.Int32,
    700: Type.Float,
    701: Type.Double,
    1700: Type.Numeric,
    1082: Type.Date,
    1114: Type.DateTime,
    1184: Type.DateTime,
    2950: Type.Uuid,
    114: Type.Json,
    3802: Type.Json,
  };
  const info = {
    provider: "postgres" as const,
    adapterName: "disposable-pglite",
  };
  async function queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const result = await pg.query<Record<string, unknown>>(
      query.sql,
      query.args,
    );
    return {
      columnNames: result.fields.map((field) => field.name),
      columnTypes: result.fields.map(
        (field) => types[field.dataTypeID] ?? Type.Text,
      ),
      rows: result.rows.map((row) =>
        result.fields.map((field) => {
          const value = row[field.name];
          if (value === null || value === undefined) return null;
          if (value instanceof Date) return value.toISOString();
          if ([114, 3802].includes(field.dataTypeID))
            return JSON.stringify(value);
          if ([20, 1700].includes(field.dataTypeID)) return String(value);
          return value;
        }),
      ),
    };
  }
  const executeRaw = async (query: SqlQuery) =>
    (await pg.query(query.sql, query.args)).affectedRows ?? 0;
  const adapter: SqlDriverAdapterFactory = {
    ...info,
    connect: async () => ({
      ...info,
      queryRaw,
      executeRaw,
      executeScript: async (script) => {
        await pg.exec(script);
      },
      dispose: async () => {},
      startTransaction: async () => {
        await pg.exec("BEGIN");
        return {
          ...info,
          queryRaw,
          executeRaw,
          options: { usePhantomQuery: true },
          commit: async () => {
            await pg.exec("COMMIT");
          },
          rollback: async () => {
            await pg.exec("ROLLBACK");
          },
        };
      },
    }),
  };
  const raw = new PrismaClient({ adapter });
  const active = raw.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(visibleQuery(model, operation, args) as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
  return {
    pg,
    raw,
    active,
    close: async () => {
      await raw.$disconnect();
      await pg.close();
    },
  };
}
