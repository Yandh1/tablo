import {
  columnId,
  createIdentifier,
  foreignKeyId,
  namespaceId,
  tableId,
  type Diagnostic,
  type DiagnosticLocation,
  type SourceSpan,
} from "../schema-ir";
import {
  PARSED_SCHEMA_VERSION,
  PARSER_DIAGNOSTICS_VERSION,
  type ParsedColumn,
  type ParsedRelationship,
  type ParsedSchemaV1,
  type ParsedTable,
  type ParseSchemaResultV1,
  type SchemaParser,
} from "../parser";
import { createPg17VendorAdapter } from "./pg17-vendor-adapter";
import { createSourceMapper, type SourceMapper } from "./source-map";
import type {
  AdapterColumn,
  AdapterConstraint,
  AdapterCreateTableStatement,
  AdapterRelation,
  AdapterToken,
  Pg17VendorAdapter,
} from "./vendor-contract";

const PUBLIC_NAMESPACE_ID = namespaceId("public");

const BUILT_IN_TYPES: Readonly<Record<string, string>> = {
  bit: "bit",
  bool: "boolean",
  boolean: "boolean",
  bpchar: "character",
  bytea: "bytea",
  char: "character",
  cidr: "cidr",
  date: "date",
  decimal: "numeric",
  float4: "real",
  float8: "double precision",
  inet: "inet",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  integer: "integer",
  interval: "interval",
  json: "json",
  jsonb: "jsonb",
  macaddr: "macaddr",
  macaddr8: "macaddr8",
  money: "money",
  name: "name",
  numeric: "numeric",
  oid: "oid",
  real: "real",
  serial: "serial",
  serial2: "smallserial",
  serial4: "serial",
  serial8: "bigserial",
  smallint: "smallint",
  text: "text",
  time: "time",
  timestamp: "timestamp",
  timestamptz: "timestamp with time zone",
  timetz: "time with time zone",
  uuid: "uuid",
  varbit: "bit varying",
  varchar: "character varying",
  xml: "xml",
};

interface ParseContext {
  source: string;
  mapper: SourceMapper;
  tokens: AdapterToken[];
  diagnostics: Diagnostic[];
}

interface PendingRelationship {
  sourceTable: ParsedTable;
  sourceColumn: ParsedColumn;
  targetRelation: AdapterRelation;
  targetColumnNormalizedName: string;
  targetRelationBytes: { startByte: number; endByte: number };
  targetColumnBytes: { startByte: number; endByte: number };
  sourceSpan: SourceSpan;
}

function tokenAtOrAfter(tokens: AdapterToken[], byte: number): AdapterToken | undefined {
  return tokens.find((token) => token.startByte >= byte || token.endByte > byte);
}

function tokensWithin(
  tokens: AdapterToken[],
  startByte: number,
  endByte: number,
): AdapterToken[] {
  return tokens.filter(
    (token) => token.startByte >= startByte && token.endByte <= endByte,
  );
}

function trimByteSpan(
  context: ParseContext,
  startByte: number,
  endByte: number,
): { startByte: number; endByte: number } {
  const tokens = tokensWithin(context.tokens, startByte, endByte);
  while (tokens.at(-1)?.kind === "ASCII_44") tokens.pop();
  if (tokens.length === 0) return { startByte, endByte: startByte };
  return {
    startByte: tokens[0]!.startByte,
    endByte: tokens.at(-1)!.endByte,
  };
}

function sourceSlice(context: ParseContext, startByte: number, endByte: number): string {
  const span = context.mapper.spanFromBytes(startByte, endByte);
  return context.source.slice(span.start.offset, span.end.offset);
}

function diagnostic(
  context: ParseContext,
  input: {
    code: string;
    severity: "error" | "warning";
    message: string;
    startByte: number;
    endByte: number;
    why: string;
    how: string;
    relatedLocations?: DiagnosticLocation[];
  },
): void {
  context.diagnostics.push({
    code: input.code,
    severity: input.severity,
    message: input.message,
    range: context.mapper.spanFromBytes(input.startByte, input.endByte),
    relatedLocations: input.relatedLocations ?? [],
    fix: { why: input.why, how: input.how },
  });
}

function identifierToken(
  context: ParseContext,
  locationByte: number,
  relationIsQualified = false,
): AdapterToken | undefined {
  const first = tokenAtOrAfter(context.tokens, locationByte);
  if (!first || !relationIsQualified) return first;
  let result = first;
  let index = context.tokens.indexOf(first) + 1;
  while (context.tokens[index]?.kind === "ASCII_46") {
    const next = context.tokens[index + 1];
    if (!next) break;
    result = next;
    index += 2;
  }
  return result;
}

function referenceTokenBytes(
  context: ParseContext,
  relation: AdapterRelation,
): {
  relation: { startByte: number; endByte: number };
  column: { startByte: number; endByte: number };
} {
  const relationToken = identifierToken(
    context,
    relation.locationByte,
    Boolean(relation.schemaName || relation.catalogName),
  );
  if (!relationToken) {
    const empty = { startByte: relation.locationByte, endByte: relation.locationByte };
    return { relation: empty, column: empty };
  }
  const relationStart = tokenAtOrAfter(context.tokens, relation.locationByte) ?? relationToken;
  const relationIndex = context.tokens.indexOf(relationToken);
  const openParenthesisIndex = context.tokens.findIndex(
    (token, index) => index > relationIndex && token.kind === "ASCII_40",
  );
  const columnToken = context.tokens[openParenthesisIndex + 1] ?? relationToken;
  return {
    relation: {
      startByte: relationStart.startByte,
      endByte: relationToken.endByte,
    },
    column: {
      startByte: columnToken.startByte,
      endByte: columnToken.endByte,
    },
  };
}

function parsedIdentifier(
  context: ParseContext,
  locationByte: number,
  relation: AdapterRelation | null = null,
) {
  const token = identifierToken(
    context,
    locationByte,
    Boolean(relation?.schemaName || relation?.catalogName),
  );
  if (!token) {
    throw new Error("The PostgreSQL scanner did not return an identifier token.");
  }
  return createIdentifier(
    token.text,
    context.mapper.spanFromBytes(token.startByte, token.endByte),
  );
}

function statementEnd(context: ParseContext, rawEndByte: number): number {
  const semicolon = context.tokens.find(
    (token) => token.startByte >= rawEndByte && token.kind === "ASCII_59",
  );
  return semicolon?.startByte === rawEndByte ? semicolon.endByte : rawEndByte;
}

function elementEndByte(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  elementStartByte: number,
): number {
  const starts = [
    ...statement.columns.map((column) => column.locationByte),
    ...statement.constraints.map((constraint) => constraint.locationByte),
  ]
    .filter((start) => start > elementStartByte)
    .sort((left, right) => left - right);
  if (starts[0] !== undefined) return starts[0];
  const finalTableClose = context.tokens
    .filter(
      (token) =>
        token.kind === "ASCII_41" &&
        token.startByte >= elementStartByte &&
        token.endByte <= statement.endByte,
    )
    .at(-1);
  return finalTableClose?.startByte ?? statement.endByte;
}

function normalizedTypeName(column: AdapterColumn): string | null {
  const parts = column.type.normalizedParts.filter((part) => part !== "pg_catalog");
  const baseName = parts.at(-1)?.toLowerCase();
  return baseName ? (BUILT_IN_TYPES[baseName] ?? null) : null;
}

function constraintSpanBytes(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  constraint: AdapterConstraint,
): { startByte: number; endByte: number } {
  return trimByteSpan(
    context,
    constraint.locationByte,
    elementEndByte(context, statement, constraint.locationByte),
  );
}

function warnNamedConstraint(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  constraint: AdapterConstraint,
): void {
  if (!constraint.name) return;
  const span = constraintSpanBytes(context, statement, constraint);
  diagnostic(context, {
    code: "PGSD1104",
    severity: "warning",
    message: `Constraint name ${constraint.name} is preserved only in source.`,
    ...span,
    why: "The MVP diagram contract models the key or relationship but not its SQL constraint name.",
    how: "Keep the name in source; it will be modeled when named constraints are supported.",
  });
}

function applySafeDeferredConstraint(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  constraint: AdapterConstraint,
): void {
  const span = constraintSpanBytes(context, statement, constraint);
  if (constraint.kind === "check") {
    diagnostic(context, {
      code: "PGSD1105",
      severity: "warning",
      message: "CHECK constraint is not represented in the MVP diagram.",
      ...span,
      why: "CHECK expression preservation is deferred, but omitting it does not change tables or relationships.",
      how: "Keep the CHECK in source; do not rely on this projection as an exportable schema.",
    });
  } else if (constraint.kind === "identity") {
    diagnostic(context, {
      code: "PGSD1106",
      severity: "warning",
      message: "Identity semantics are not represented in the MVP diagram.",
      ...span,
      why: "The column can be rendered safely, but identity generation details are deferred.",
      how: "Keep the identity clause in source; it will not be included in ParsedSchema.",
    });
  } else if (constraint.kind === "default") {
    diagnostic(context, {
      code: "PGSD1111",
      severity: "warning",
      message: "DEFAULT expression is not represented in the MVP diagram.",
      ...span,
      why: "Default expressions are outside this parser projection and are preserved only in source.",
      how: "Keep the DEFAULT in source; convert through full SchemaIR support before export.",
    });
  } else if (constraint.kind === "generated") {
    diagnostic(context, {
      code: "PGSD1112",
      severity: "warning",
      message: "Generated-column semantics are not represented in the MVP diagram.",
      ...span,
      why: "The column can be rendered, but its generation expression is outside the MVP parser contract.",
      how: "Keep the generated expression in source and do not export ParsedSchema directly.",
    });
  }
}

function addConstraintShapeError(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  constraint: AdapterConstraint,
): void {
  const span = constraintSpanBytes(context, statement, constraint);
  diagnostic(context, {
    code: "PGSD1103",
    severity: "error",
    message: "Composite keys are not supported by the MVP parser.",
    ...span,
    why: "This parser contract can map exactly one local column to exactly one referenced column.",
    how: "Use a single-column key for now, or wait for composite-key support.",
  });
}

function findColumn(
  table: ParsedTable,
  normalizedName: string,
): ParsedColumn | undefined {
  return table.columns.find(
    (column) => column.name.normalizedName === normalizedName,
  );
}

function buildColumn(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  tableIdValue: string,
  column: AdapterColumn,
  ordinal: number,
): ParsedColumn {
  const name = parsedIdentifier(context, column.locationByte);
  const rawElementEnd = elementEndByte(context, statement, column.locationByte);
  const elementSpan = trimByteSpan(context, column.locationByte, rawElementEnd);
  const firstConstraintByte = column.constraints
    .map((constraint) => constraint.locationByte)
    .sort((left, right) => left - right)[0];
  const typeEnd = firstConstraintByte ?? elementSpan.endByte;
  const typeSpan = trimByteSpan(context, column.type.locationByte, typeEnd);
  const normalizedType = normalizedTypeName(column);

  if (!normalizedType) {
    diagnostic(context, {
      code: "PGSD1110",
      severity: "error",
      message: "This data type is outside the supported PostgreSQL MVP type set.",
      ...typeSpan,
      why: "The parser only adopts common built-in PostgreSQL types in this slice.",
      how: "Use a supported built-in type or keep the last-valid diagram until custom types are supported.",
    });
  }

  if (column.type.arrayDimensions > 0) {
    diagnostic(context, {
      code: "PGSD1108",
      severity: "warning",
      message: "Array type is displayed but its array semantics are not interpreted.",
      ...typeSpan,
      why: "The MVP preserves the complete displayed type while deferring array-specific modeling.",
      how: "Keep the array declaration in source; only its displayed type is available to the diagram.",
    });
  }

  if (column.hasUnsupportedCollation) {
    diagnostic(context, {
      code: "PGSD1113",
      severity: "warning",
      message: "Column collation is preserved only in source.",
      ...elementSpan,
      why: "Collation does not change the MVP table or relationship projection.",
      how: "Keep the COLLATE clause in source and validate through a later full-schema layer.",
    });
  }

  const primaryKey = column.constraints.some(
    (constraint) => constraint.kind === "primary-key",
  );
  const notNull = column.constraints.some(
    (constraint) => constraint.kind === "not-null",
  );
  const unique = column.constraints.some(
    (constraint) => constraint.kind === "unique",
  );

  return {
    id: columnId(tableIdValue, name.normalizedName),
    name,
    ordinal,
    dataType: {
      displayName: sourceSlice(context, typeSpan.startByte, typeSpan.endByte),
      normalizedName: normalizedType ?? "unsupported",
      sourceSpan: context.mapper.spanFromBytes(typeSpan.startByte, typeSpan.endByte),
    },
    nullable: !(notNull || primaryKey),
    primaryKey,
    unique,
    sourceSpan: context.mapper.spanFromBytes(
      elementSpan.startByte,
      elementSpan.endByte,
    ),
  };
}

function applyColumnConstraints(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  table: ParsedTable,
  sourceColumn: ParsedColumn,
  constraints: AdapterConstraint[],
  pendingRelationships: PendingRelationship[],
): void {
  for (const constraint of constraints) {
    warnNamedConstraint(context, statement, constraint);
    if (["check", "identity", "default", "generated"].includes(constraint.kind)) {
      applySafeDeferredConstraint(context, statement, constraint);
      continue;
    }
    if (["primary-key", "not-null", "unique"].includes(constraint.kind)) continue;
    if (constraint.kind === "foreign-key") {
      if (
        !constraint.referencedRelation ||
        constraint.referencedColumns.length !== 1
      ) {
        addConstraintShapeError(context, statement, constraint);
        continue;
      }
      const span = constraintSpanBytes(context, statement, constraint);
      const targetBytes = referenceTokenBytes(
        context,
        constraint.referencedRelation,
      );
      if (constraint.hasUnsupportedForeignKeyOptions) {
        diagnostic(context, {
          code: "PGSD1114",
          severity: "warning",
          message: "Foreign-key actions are preserved only in source.",
          ...span,
          why: "The MVP relationship projection records endpoints but not referential actions or deferrability.",
          how: "Keep the clauses in source and validate through SchemaIR before export.",
        });
      }
      pendingRelationships.push({
        sourceTable: table,
        sourceColumn,
        targetRelation: constraint.referencedRelation,
        targetColumnNormalizedName: constraint.referencedColumns[0]!,
        targetRelationBytes: targetBytes.relation,
        targetColumnBytes: targetBytes.column,
        sourceSpan: context.mapper.spanFromBytes(span.startByte, span.endByte),
      });
      continue;
    }

    const span = constraintSpanBytes(context, statement, constraint);
    diagnostic(context, {
      code: "PGSD1115",
      severity: "error",
      message: "This column constraint is not supported by the MVP parser.",
      ...span,
      why: "Adopting an unknown constraint could misrepresent the schema.",
      how: "Remove the constraint from this parser slice or wait for explicit support.",
    });
  }
}

function applyTableConstraints(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  table: ParsedTable,
  pendingRelationships: PendingRelationship[],
): void {
  for (const constraint of statement.constraints) {
    warnNamedConstraint(context, statement, constraint);
    if (["check", "identity", "default", "generated"].includes(constraint.kind)) {
      applySafeDeferredConstraint(context, statement, constraint);
      continue;
    }

    if (constraint.kind === "primary-key" || constraint.kind === "unique") {
      if (constraint.localColumns.length !== 1) {
        addConstraintShapeError(context, statement, constraint);
        continue;
      }
      const parsedColumn = findColumn(table, constraint.localColumns[0]!);
      if (!parsedColumn) {
        const span = constraintSpanBytes(context, statement, constraint);
        diagnostic(context, {
          code: "PGSD1202",
          severity: "error",
          message: `Column ${constraint.localColumns[0]} does not exist in table ${table.name.displayName}.`,
          ...span,
          why: "The table-level constraint names a column that was not declared in this table.",
          how: "Correct the column name or add the missing column.",
          relatedLocations: [{
            message: "Table declaration is here.",
            range: table.name.sourceSpan,
          }],
        });
        continue;
      }
      if (constraint.kind === "primary-key") {
        parsedColumn.primaryKey = true;
        parsedColumn.nullable = false;
      } else {
        parsedColumn.unique = true;
      }
      continue;
    }

    if (constraint.kind === "foreign-key") {
      if (
        constraint.localColumns.length !== 1 ||
        constraint.referencedColumns.length !== 1 ||
        !constraint.referencedRelation
      ) {
        addConstraintShapeError(context, statement, constraint);
        continue;
      }
      const parsedColumn = findColumn(table, constraint.localColumns[0]!);
      const span = constraintSpanBytes(context, statement, constraint);
      if (!parsedColumn) {
        diagnostic(context, {
          code: "PGSD1202",
          severity: "error",
          message: `Foreign-key column ${constraint.localColumns[0]} does not exist in table ${table.name.displayName}.`,
          ...span,
          why: "The foreign key names a local column that was not declared in this table.",
          how: "Correct the local column name or add the missing column.",
          relatedLocations: [{ message: "Table declaration is here.", range: table.name.sourceSpan }],
        });
        continue;
      }
      if (constraint.hasUnsupportedForeignKeyOptions) {
        diagnostic(context, {
          code: "PGSD1114",
          severity: "warning",
          message: "Foreign-key actions are preserved only in source.",
          ...span,
          why: "The MVP relationship projection records endpoints but not referential actions or deferrability.",
          how: "Keep the clauses in source and validate through SchemaIR before export.",
        });
      }
      const targetBytes = referenceTokenBytes(
        context,
        constraint.referencedRelation,
      );
      pendingRelationships.push({
        sourceTable: table,
        sourceColumn: parsedColumn,
        targetRelation: constraint.referencedRelation,
        targetColumnNormalizedName: constraint.referencedColumns[0]!,
        targetRelationBytes: targetBytes.relation,
        targetColumnBytes: targetBytes.column,
        sourceSpan: context.mapper.spanFromBytes(span.startByte, span.endByte),
      });
      continue;
    }

    const span = constraintSpanBytes(context, statement, constraint);
    diagnostic(context, {
      code: "PGSD1115",
      severity: "error",
      message: "This table constraint is not supported by the MVP parser.",
      ...span,
      why: "Adopting an unknown constraint could misrepresent the schema.",
      how: "Remove the constraint from this parser slice or wait for explicit support.",
    });
  }
}

function buildTable(
  context: ParseContext,
  statement: AdapterCreateTableStatement,
  pendingRelationships: PendingRelationship[],
): ParsedTable {
  const name = parsedIdentifier(
    context,
    statement.relation.locationByte,
    statement.relation,
  );
  const id = tableId(PUBLIC_NAMESPACE_ID, name.normalizedName);
  const table: ParsedTable = {
    id,
    name,
    columns: statement.columns.map((column, ordinal) =>
      buildColumn(context, statement, id, column, ordinal),
    ),
    sourceSpan: context.mapper.spanFromBytes(
      context.tokens.find(
        (token) =>
          token.kind === "CREATE" &&
          token.startByte >= statement.startByte &&
          token.endByte <= statement.endByte,
      )?.startByte ?? statement.startByte,
      statementEnd(context, statement.endByte),
    ),
  };

  if (
    statement.relation.catalogName ||
    (statement.relation.schemaName && statement.relation.schemaName !== "public")
  ) {
    const relationToken = identifierToken(
      context,
      statement.relation.locationByte,
      Boolean(statement.relation.schemaName || statement.relation.catalogName),
    );
    diagnostic(context, {
      code: "PGSD1107",
      severity: "error",
      message: "Multiple PostgreSQL schemas are not supported by the MVP parser.",
      startByte: statement.relation.locationByte,
      endByte: relationToken?.endByte ?? statement.relation.locationByte,
      why: "ParsedSchema v1 has one implicit public namespace and cannot safely disambiguate other schemas.",
      how: "Use unqualified or public-qualified table names in this project.",
    });
  }

  if (statement.hasUnsupportedTableFeatures) {
    diagnostic(context, {
      code: "PGSD1116",
      severity: "error",
      message: "This CREATE TABLE form includes unsupported table features.",
      startByte: statement.startByte,
      endByte: statementEnd(context, statement.endByte),
      why: "Inheritance, partitioning, typed tables, IF NOT EXISTS, storage options, and table access methods are outside this MVP contract.",
      how: "Use a plain CREATE TABLE statement containing supported columns and constraints.",
    });
  }

  const seenColumns = new Map<string, ParsedColumn>();
  for (const column of table.columns) {
    const previous = seenColumns.get(column.name.normalizedName);
    if (previous) {
      context.diagnostics.push({
        code: "PGSD1205",
        severity: "error",
        message: `Column ${column.name.displayName} is declared more than once.`,
        range: column.name.sourceSpan,
        relatedLocations: [{ message: "First declaration is here.", range: previous.name.sourceSpan }],
        fix: {
          why: "PostgreSQL identifiers compare after unquoted names are folded to lower case.",
          how: "Rename or remove one of the duplicate columns.",
        },
      });
    } else {
      seenColumns.set(column.name.normalizedName, column);
    }
  }

  statement.columns.forEach((column, index) => {
    const parsedColumn = table.columns[index]!;
    applyColumnConstraints(
      context,
      statement,
      table,
      parsedColumn,
      column.constraints,
      pendingRelationships,
    );
  });
  applyTableConstraints(context, statement, table, pendingRelationships);
  const primaryColumns = table.columns.filter((column) => column.primaryKey);
  if (primaryColumns.length > 1) {
    context.diagnostics.push({
      code: "PGSD1103",
      severity: "error",
      message: "Composite primary keys are not supported by the MVP parser.",
      range: table.sourceSpan,
      relatedLocations: primaryColumns.map((column) => ({
        message: "Primary-key column is declared here.",
        range: column.name.sourceSpan,
      })),
      fix: {
        why: "More than one column is marked PRIMARY KEY in this table.",
        how: "Use one primary-key column for now, or wait for composite-key support.",
      },
    });
  }
  return table;
}

function resolveRelationships(
  context: ParseContext,
  tables: ParsedTable[],
  pending: PendingRelationship[],
): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];
  for (const item of pending) {
    if (
      item.targetRelation.catalogName ||
      (item.targetRelation.schemaName && item.targetRelation.schemaName !== "public")
    ) {
      diagnostic(context, {
        code: "PGSD1107",
        severity: "error",
        message: "Cross-schema references are not supported by the MVP parser.",
        ...item.targetRelationBytes,
        why: "ParsedSchema v1 has one implicit public namespace.",
        how: "Reference an unqualified or public-qualified table.",
      });
      continue;
    }

    const targetTable = tables.find(
      (table) => table.name.normalizedName === item.targetRelation.normalizedName,
    );
    if (!targetTable) {
      diagnostic(context, {
        code: "PGSD1201",
        severity: "error",
        message: `Referenced table ${item.targetRelation.normalizedName} does not exist.`,
        ...item.targetRelationBytes,
        why: "The foreign key target cannot be resolved among the CREATE TABLE statements.",
        how: "Add the target table or correct the referenced table name.",
        relatedLocations: [{ message: "Foreign key is declared here.", range: item.sourceSpan }],
      });
      continue;
    }
    const targetColumn = findColumn(targetTable, item.targetColumnNormalizedName);
    if (!targetColumn) {
      diagnostic(context, {
        code: "PGSD1202",
        severity: "error",
        message: `Referenced column ${item.targetColumnNormalizedName} does not exist in table ${targetTable.name.displayName}.`,
        ...item.targetColumnBytes,
        why: "The foreign key target column cannot be resolved in the referenced table.",
        how: "Correct the referenced column name or add that column to the target table.",
        relatedLocations: [
          { message: "Foreign key is declared here.", range: item.sourceSpan },
          { message: "Referenced table is declared here.", range: targetTable.name.sourceSpan },
        ],
      });
      continue;
    }

    if (item.sourceColumn.dataType.normalizedName !== targetColumn.dataType.normalizedName) {
      diagnostic(context, {
        code: "PGSD1109",
        severity: "warning",
        message: "Foreign-key column type compatibility is not validated.",
        ...item.targetColumnBytes,
        why: `The local type ${item.sourceColumn.dataType.displayName} and target type ${targetColumn.dataType.displayName} differ, and PostgreSQL coercion rules are outside this parser slice.`,
        how: "Use matching column types or validate compatibility in PostgreSQL before relying on the relationship.",
        relatedLocations: [
          { message: "Local column type is here.", range: item.sourceColumn.dataType.sourceSpan },
          { message: "Referenced column type is here.", range: targetColumn.dataType.sourceSpan },
        ],
      });
    }

    relationships.push({
      id: foreignKeyId({
        tableId: item.sourceTable.id,
        normalizedName: null,
        orderedColumnIds: [item.sourceColumn.id],
        referencedTableId: targetTable.id,
        orderedReferencedColumnIds: [targetColumn.id],
      }),
      sourceTableId: item.sourceTable.id,
      sourceColumnId: item.sourceColumn.id,
      targetTableId: targetTable.id,
      targetColumnId: targetColumn.id,
      sourceSpan: item.sourceSpan,
    });
  }
  return relationships;
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort(
    (left, right) =>
      left.range.start.offset - right.range.start.offset ||
      left.code.localeCompare(right.code),
  );
}

async function parseWithAdapter(
  adapter: Pg17VendorAdapter,
  source: string,
): Promise<ParseSchemaResultV1> {
  const mapper = createSourceMapper(source);
  const adapted = await adapter.parse(source);
  const context: ParseContext = {
    source,
    mapper,
    tokens: adapted.tokens,
    diagnostics: [],
  };

  if (adapted.status === "invalid") {
    const token = adapted.tokens.find((candidate) => {
      const span = mapper.spanFromBytes(candidate.startByte, candidate.endByte);
      return (
        span.start.offset >= adapted.error.positionUtf16 ||
        span.end.offset > adapted.error.positionUtf16
      );
    });
    const errorOffset = Math.max(
      0,
      Math.min(source.length, adapted.error.positionUtf16),
    );
    const errorEnd = Math.min(
      source.length,
      errorOffset + (source.codePointAt(errorOffset) && source.codePointAt(errorOffset)! > 0xffff ? 2 : 1),
    );
    context.diagnostics.push({
      code: "PGSD1001",
      severity: "error",
      message: adapted.error.message.replace(/^syntax error/u, "PostgreSQL syntax error"),
      range: token
        ? mapper.spanFromBytes(token.startByte, token.endByte)
        : mapper.spanFromUtf16(errorOffset, errorEnd),
      relatedLocations: [],
      fix: {
        why: "PostgreSQL could not form a complete CREATE TABLE syntax tree at this location.",
        how: "Correct the token or complete the statement; the last-valid schema must remain active.",
      },
    });
    return {
      status: "invalid",
      schema: null,
      diagnostics: { version: PARSER_DIAGNOSTICS_VERSION, diagnostics: context.diagnostics },
    };
  }

  if (adapted.status === "failed") {
    context.diagnostics.push({
      code: "PGSD9001",
      severity: "error",
      message: "The PostgreSQL parser failed to process this source.",
      range: mapper.spanFromUtf16(
        adapted.error.positionUtf16,
        adapted.error.positionUtf16,
      ),
      relatedLocations: [],
      fix: {
        why: "The parser reported an operational failure rather than a user syntax error.",
        how: "Retry parsing without changing or discarding the source.",
      },
    });
    return {
      status: "failed",
      schema: null,
      diagnostics: { version: PARSER_DIAGNOSTICS_VERSION, diagnostics: context.diagnostics },
    };
  }

  const createStatements: AdapterCreateTableStatement[] = [];
  for (const statement of adapted.statements) {
    if (statement.kind === "create-table") {
      createStatements.push(statement);
      continue;
    }
    const isAlter = statement.statementKind === "AlterTableStmt";
    diagnostic(context, {
      code: isAlter ? "PGSD1102" : "PGSD1101",
      severity: "error",
      message: isAlter
        ? "ALTER TABLE is not supported by the MVP parser."
        : "Only CREATE TABLE statements are supported by the MVP parser.",
      startByte: tokenAtOrAfter(context.tokens, statement.startByte)?.startByte ?? statement.startByte,
      endByte: statementEnd(context, statement.endByte),
      why: isAlter
        ? "ALTER TABLE application is deferred, so accepting it would leave the rendered structure incomplete."
        : `The ${statement.statementKind} statement is valid PostgreSQL but outside this parser contract.`,
      how: isAlter
        ? "Move the supported constraint into CREATE TABLE or wait for ALTER TABLE support."
        : "Keep this document to CREATE TABLE statements for the current MVP parser.",
    });
  }

  const pendingRelationships: PendingRelationship[] = [];
  const tables = createStatements.map((statement) =>
    buildTable(context, statement, pendingRelationships),
  );

  const seenTables = new Map<string, ParsedTable>();
  for (const table of tables) {
    const previous = seenTables.get(table.name.normalizedName);
    if (previous) {
      const span = table.name.sourceSpan;
      context.diagnostics.push({
        code: "PGSD1204",
        severity: "error",
        message: `Table ${table.name.displayName} is declared more than once.`,
        range: span,
        relatedLocations: [{ message: "First declaration is here.", range: previous.name.sourceSpan }],
        fix: {
          why: "PostgreSQL identifiers compare after unquoted names are folded to lower case.",
          how: "Rename or remove one of the duplicate tables.",
        },
      });
    } else {
      seenTables.set(table.name.normalizedName, table);
    }
  }

  const relationships = resolveRelationships(context, tables, pendingRelationships);
  const diagnostics = sortDiagnostics(context.diagnostics);
  if (diagnostics.some((item) => item.severity === "error")) {
    return {
      status: "invalid",
      schema: null,
      diagnostics: { version: PARSER_DIAGNOSTICS_VERSION, diagnostics },
    };
  }

  const schema: ParsedSchemaV1 = {
    version: PARSED_SCHEMA_VERSION,
    dialect: "postgresql",
    tables,
    relationships,
    exportEligibility: "requires-schema-ir-validation",
  };
  return {
    status: diagnostics.length > 0 ? "parsed-with-warnings" : "parsed",
    schema,
    diagnostics: { version: PARSER_DIAGNOSTICS_VERSION, diagnostics },
  };
}

export async function createPostgresSchemaParser(): Promise<SchemaParser> {
  const adapter = await createPg17VendorAdapter();
  return { parse: (source) => parseWithAdapter(adapter, source) };
}
