import { z } from "zod";

import {
  checkConstraintId,
  columnId,
  foreignKeyId,
  namespaceId,
  primaryKeyId,
  schemaId,
  tableId,
  uniqueConstraintId,
} from "./ids";
import type { DiagnosticSetV1, SchemaIRV1 } from "./types";

const sourcePositionSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
  })
  .strict();

const sourceSpanSchema = z
  .object({
    start: sourcePositionSchema,
    end: sourcePositionSchema,
  })
  .strict()
  .superRefine((span, context) => {
    if (span.end.offset < span.start.offset) {
      context.addIssue({
        code: "custom",
        path: ["end", "offset"],
        message: "A source span must not end before it starts.",
      });
    }
  });

const identifierSchema = z
  .object({
    displayName: z.string().min(1),
    normalizedName: z.string().min(1),
    quoted: z.boolean(),
    sourceSpan: sourceSpanSchema,
  })
  .strict()
  .superRefine((identifier, context) => {
    const expected = identifier.quoted
      ? identifier.displayName
      : identifier.displayName.toLowerCase();

    if (identifier.normalizedName !== expected) {
      context.addIssue({
        code: "custom",
        path: ["normalizedName"],
        message: "Identifier normalization does not match PostgreSQL rules.",
      });
    }
  });

const dataTypeSchema = z
  .object({
    displayName: z.string().min(1),
    normalizedName: z.string().min(1),
    modifiers: z.array(
      z
        .object({
          displayValue: z.string().min(1),
          normalizedValue: z.string().min(1),
        })
        .strict(),
    ),
    arrayDimensions: z.number().int().nonnegative(),
    sourceSpan: sourceSpanSchema,
  })
  .strict();

const columnSchema = z
  .object({
    id: z.string().min(1),
    name: identifierSchema,
    ordinal: z.number().int().nonnegative(),
    dataType: dataTypeSchema,
    nullable: z.boolean(),
    defaultExpression: z.string().min(1).nullable(),
    sourceSpan: sourceSpanSchema,
  })
  .strict();

const constraintBase = {
  id: z.string().min(1),
  name: identifierSchema.nullable(),
  columnIds: z.array(z.string().min(1)).min(1),
  sourceSpan: sourceSpanSchema,
};

const primaryKeySchema = z
  .object({ kind: z.literal("primary-key"), ...constraintBase })
  .strict();

const uniqueConstraintSchema = z
  .object({ kind: z.literal("unique"), ...constraintBase })
  .strict();

const foreignKeySchema = z
  .object({
    kind: z.literal("foreign-key"),
    ...constraintBase,
    referencedTableId: z.string().min(1),
    referencedColumnIds: z.array(z.string().min(1)).min(1),
    match: z.enum(["simple", "full", "partial"]),
    onUpdate: z.enum([
      "no-action",
      "restrict",
      "cascade",
      "set-null",
      "set-default",
    ]),
    onDelete: z.enum([
      "no-action",
      "restrict",
      "cascade",
      "set-null",
      "set-default",
    ]),
  })
  .strict();

const checkConstraintSchema = z
  .object({
    kind: z.literal("check"),
    id: z.string().min(1),
    name: identifierSchema.nullable(),
    expression: z.string().min(1),
    normalizedExpression: z.string().min(1),
    sourceSpan: sourceSpanSchema,
  })
  .strict();

const tableSchema = z
  .object({
    id: z.string().min(1),
    namespaceId: z.string().min(1),
    name: identifierSchema,
    columns: z.array(columnSchema),
    constraints: z
      .object({
        primaryKey: primaryKeySchema.nullable(),
        unique: z.array(uniqueConstraintSchema),
        foreignKeys: z.array(foreignKeySchema),
        checks: z.array(checkConstraintSchema),
      })
      .strict(),
    sourceSpan: sourceSpanSchema,
  })
  .strict();

const namespaceSchema = z
  .object({
    id: z.string().min(1),
    name: identifierSchema,
    tables: z.array(tableSchema),
    sourceSpan: sourceSpanSchema.nullable(),
  })
  .strict();

const schemaIrV1Schema = z
  .object({
    version: z.literal(1),
    dialect: z.literal("postgresql"),
    id: z.string().min(1),
    source: z
      .object({
        format: z.enum(["postgresql-sql", "simple-schema"]),
        hash: z.string().min(1),
      })
      .strict(),
    namespaces: z.array(namespaceSchema),
  })
  .strict()
  .superRefine(validateSchemaGraph);

const diagnosticSchema = z
  .object({
    code: z.string().regex(/^PGSD\d{4}$/u),
    severity: z.enum(["error", "warning", "info"]),
    message: z.string().min(1),
    range: sourceSpanSchema,
    relatedLocations: z.array(
      z
        .object({ message: z.string().min(1), range: sourceSpanSchema })
        .strict(),
    ),
    fix: z
      .object({
        why: z.string().min(1),
        how: z.string().min(1),
        example: z.string().min(1).optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const diagnosticSetV1Schema = z
  .object({
    version: z.literal(1),
    sourceRevision: z.number().int().nonnegative(),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

function validateSchemaGraph(
  schema: z.infer<typeof schemaIrV1Schema>,
  context: z.RefinementCtx,
): void {
  if (schema.id !== schemaId()) {
    addIssue(context, ["id"], "Schema ID is not canonical for SchemaIR v1.");
  }

  const tableById = new Map<string, (typeof schema.namespaces)[number]["tables"][number]>();
  const columnOwnerById = new Map<string, string>();
  const allIds = new Set<string>([schema.id]);

  schema.namespaces.forEach((namespace, namespaceIndex) => {
    const namespacePath = ["namespaces", namespaceIndex] as const;
    const expectedNamespaceId = namespaceId(namespace.name.normalizedName);
    checkCanonicalId(context, allIds, namespace.id, expectedNamespaceId, [
      ...namespacePath,
      "id",
    ]);

    const tableNames = new Set<string>();
    namespace.tables.forEach((table, tableIndex) => {
      const tablePath = [...namespacePath, "tables", tableIndex] as const;
      const expectedTableId = tableId(namespace.id, table.name.normalizedName);
      checkCanonicalId(context, allIds, table.id, expectedTableId, [
        ...tablePath,
        "id",
      ]);

      if (table.namespaceId !== namespace.id) {
        addIssue(context, [...tablePath, "namespaceId"], "Table namespace does not exist at this location.");
      }
      if (tableNames.has(table.name.normalizedName)) {
        addIssue(context, [...tablePath, "name", "normalizedName"], "Duplicate normalized table name in namespace.");
      }
      tableNames.add(table.name.normalizedName);
      tableById.set(table.id, table);

      const columnNames = new Set<string>();
      table.columns.forEach((column, columnIndex) => {
        const columnPath = [...tablePath, "columns", columnIndex] as const;
        checkCanonicalId(
          context,
          allIds,
          column.id,
          columnId(table.id, column.name.normalizedName),
          [...columnPath, "id"],
        );
        columnOwnerById.set(column.id, table.id);
        if (column.ordinal !== columnIndex) {
          addIssue(context, [...columnPath, "ordinal"], "Column ordinals must be contiguous and match source order.");
        }
        if (columnNames.has(column.name.normalizedName)) {
          addIssue(context, [...columnPath, "name", "normalizedName"], "Duplicate normalized column name in table.");
        }
        columnNames.add(column.name.normalizedName);
      });
    });
  });

  schema.namespaces.forEach((namespace, namespaceIndex) => {
    namespace.tables.forEach((table, tableIndex) => {
      const constraintPath = [
        "namespaces",
        namespaceIndex,
        "tables",
        tableIndex,
        "constraints",
      ] as const;
      const primaryKey = table.constraints.primaryKey;
      if (primaryKey) {
        validateLocalColumns(context, primaryKey.columnIds, table.id, columnOwnerById, [...constraintPath, "primaryKey", "columnIds"]);
        checkCanonicalId(context, allIds, primaryKey.id, primaryKeyId({
          tableId: table.id,
          normalizedName: primaryKey.name?.normalizedName ?? null,
          orderedColumnIds: primaryKey.columnIds,
        }), [...constraintPath, "primaryKey", "id"]);
      }

      table.constraints.unique.forEach((constraint, index) => {
        const path = [...constraintPath, "unique", index] as const;
        validateLocalColumns(context, constraint.columnIds, table.id, columnOwnerById, [...path, "columnIds"]);
        checkCanonicalId(context, allIds, constraint.id, uniqueConstraintId({
          tableId: table.id,
          normalizedName: constraint.name?.normalizedName ?? null,
          orderedColumnIds: constraint.columnIds,
        }), [...path, "id"]);
      });

      table.constraints.foreignKeys.forEach((constraint, index) => {
        const path = [...constraintPath, "foreignKeys", index] as const;
        validateLocalColumns(context, constraint.columnIds, table.id, columnOwnerById, [...path, "columnIds"]);
        if (constraint.columnIds.length !== constraint.referencedColumnIds.length) {
          addIssue(context, [...path, "referencedColumnIds"], "Foreign-key column lists must have the same length.");
        }
        const referencedTable = tableById.get(constraint.referencedTableId);
        if (!referencedTable) {
          addIssue(context, [...path, "referencedTableId"], "Foreign key references an unknown table.");
        } else {
          validateLocalColumns(context, constraint.referencedColumnIds, referencedTable.id, columnOwnerById, [...path, "referencedColumnIds"]);
        }
        checkCanonicalId(context, allIds, constraint.id, foreignKeyId({
          tableId: table.id,
          normalizedName: constraint.name?.normalizedName ?? null,
          orderedColumnIds: constraint.columnIds,
          referencedTableId: constraint.referencedTableId,
          orderedReferencedColumnIds: constraint.referencedColumnIds,
        }), [...path, "id"]);
      });

      table.constraints.checks.forEach((constraint, index) => {
        const path = [...constraintPath, "checks", index] as const;
        checkCanonicalId(context, allIds, constraint.id, checkConstraintId({
          tableId: table.id,
          normalizedName: constraint.name?.normalizedName ?? null,
          normalizedExpression: constraint.normalizedExpression,
        }), [...path, "id"]);
      });
    });
  });
}

function validateLocalColumns(
  context: z.RefinementCtx,
  columnIds: readonly string[],
  expectedTableId: string,
  ownerByColumnId: ReadonlyMap<string, string>,
  path: readonly (string | number)[],
): void {
  const seen = new Set<string>();
  columnIds.forEach((id, index) => {
    if (seen.has(id)) {
      addIssue(context, [...path, index], "A constraint cannot repeat a column.");
    }
    seen.add(id);
    if (ownerByColumnId.get(id) !== expectedTableId) {
      addIssue(context, [...path, index], "Constraint column does not belong to the expected table.");
    }
  });
}

function checkCanonicalId(
  context: z.RefinementCtx,
  allIds: Set<string>,
  actual: string,
  expected: string,
  path: readonly (string | number)[],
): void {
  if (actual !== expected) {
    addIssue(context, path, "ID does not match its canonical SchemaIR v1 inputs.");
  }
  if (allIds.has(actual)) {
    addIssue(context, path, "Duplicate ID in SchemaIR graph.");
  }
  allIds.add(actual);
}

function addIssue(
  context: z.RefinementCtx,
  path: readonly (string | number)[],
  message: string,
): void {
  context.addIssue({ code: "custom", path: [...path], message });
}

export interface RuntimeValidationIssue {
  path: readonly (string | number)[];
  message: string;
}

export type RuntimeValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: RuntimeValidationIssue[] };

export class SchemaIRValidationError extends Error {
  readonly issues: readonly RuntimeValidationIssue[];

  constructor(issues: readonly RuntimeValidationIssue[]) {
    super("Input is not a valid canonical SchemaIR v1 document.");
    this.name = "SchemaIRValidationError";
    this.issues = issues;
  }
}

function toPublicResult<T>(result: z.ZodSafeParseResult<T>): RuntimeValidationResult<T> {
  if (result.success) {
    return result;
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number",
      ),
      message: issue.message,
    })),
  };
}

export function validateSchemaIR(input: unknown): RuntimeValidationResult<SchemaIRV1> {
  return toPublicResult(schemaIrV1Schema.safeParse(input));
}

export function parseSchemaIR(input: unknown): SchemaIRV1 {
  const result = validateSchemaIR(input);
  if (!result.success) {
    throw new SchemaIRValidationError(result.issues);
  }

  return result.data;
}

export function isSchemaIR(input: unknown): input is SchemaIRV1 {
  return schemaIrV1Schema.safeParse(input).success;
}

export function validateDiagnosticSet(
  input: unknown,
): RuntimeValidationResult<DiagnosticSetV1> {
  return toPublicResult(diagnosticSetV1Schema.safeParse(input));
}
