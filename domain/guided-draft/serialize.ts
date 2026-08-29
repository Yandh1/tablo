import { normalizePostgresIdentifier } from "../schema-ir";
import {
  GUIDED_SQL_SERIALIZATION_VERSION,
  type GeneratedGuidedSqlV1,
  type GuidedColumnDraft,
  type GuidedDraftIssue,
  type GuidedDraftV1,
  type GuidedIdentifierDraft,
  type GuidedSqlSerializationResult,
  type GuidedTableDraft,
} from "./types";

function renderIdentifier(identifier: GuidedIdentifierDraft): string {
  if (identifier.quoted) {
    return `"${identifier.value.replaceAll('"', '""')}"`;
  }

  normalizePostgresIdentifier(identifier.value);
  return identifier.value;
}

function normalizedIdentifier(identifier: GuidedIdentifierDraft): string {
  const raw = identifier.quoted
    ? `"${identifier.value.replaceAll('"', '""')}"`
    : identifier.value;
  return normalizePostgresIdentifier(raw).normalizedName;
}

function referenceClause(
  draft: GuidedDraftV1,
  column: GuidedColumnDraft,
): string | null {
  if (!column.references) {
    return null;
  }

  const table = draft.tables.find(
    (candidate) => candidate.id === column.references?.tableDraftId,
  );
  const referencedColumn = table?.columns.find(
    (candidate) => candidate.id === column.references?.columnDraftId,
  );
  if (!table || !referencedColumn) {
    return null;
  }

  const actions = [
    column.references.onDelete === "no-action"
      ? null
      : `ON DELETE ${column.references.onDelete.toUpperCase().replace("-", " ")}`,
    column.references.onUpdate === "no-action"
      ? null
      : `ON UPDATE ${column.references.onUpdate.toUpperCase().replace("-", " ")}`,
  ].filter((value): value is string => value !== null);

  return [
    `REFERENCES ${renderIdentifier(draft.namespace)}.${renderIdentifier(table.name)}`,
    `(${renderIdentifier(referencedColumn.name)})`,
    ...actions,
  ].join(" ");
}

function validateDraft(draft: GuidedDraftV1): GuidedDraftIssue[] {
  const issues: GuidedDraftIssue[] = [];
  const tableNames = new Set<string>();

  for (const table of draft.tables) {
    if (table.name.value.length === 0) {
      issues.push({
        code: "empty-table-name",
        tableDraftId: table.id,
        message: "A table name is required before generated SQL can be validated.",
      });
      continue;
    }

    if (table.columns.length === 0) {
      issues.push({
        code: "empty-table-columns",
        tableDraftId: table.id,
        message:
          "A provisional table needs at least one complete column before canonical validation.",
      });
    }

    let tableName: string;
    try {
      tableName = normalizedIdentifier(table.name);
    } catch {
      issues.push({
        code: "invalid-identifier",
        tableDraftId: table.id,
        message: "The table name is not a valid PostgreSQL identifier.",
      });
      continue;
    }
    if (tableNames.has(tableName)) {
      issues.push({
        code: "duplicate-table-name",
        tableDraftId: table.id,
        message: "Table names must be unique after PostgreSQL normalization.",
      });
    }
    tableNames.add(tableName);

    const columnNames = new Set<string>();
    for (const column of table.columns) {
      if (column.name.value.length === 0) {
        issues.push({
          code: "empty-column-name",
          tableDraftId: table.id,
          columnDraftId: column.id,
          message: "A column name is required.",
        });
      } else {
        try {
          const columnName = normalizedIdentifier(column.name);
          if (columnNames.has(columnName)) {
            issues.push({
              code: "duplicate-column-name",
              tableDraftId: table.id,
              columnDraftId: column.id,
              message: "Column names must be unique after PostgreSQL normalization.",
            });
          }
          columnNames.add(columnName);
        } catch {
          issues.push({
            code: "invalid-identifier",
            tableDraftId: table.id,
            columnDraftId: column.id,
            message: "The column name is not a valid PostgreSQL identifier.",
          });
        }
      }

      if (column.dataType.trim().length === 0) {
        issues.push({
          code: "empty-data-type",
          tableDraftId: table.id,
          columnDraftId: column.id,
          message: "A PostgreSQL data type is required.",
        });
      }
      if (column.references && referenceClause(draft, column) === null) {
        issues.push({
          code: "missing-reference-target",
          tableDraftId: table.id,
          columnDraftId: column.id,
          message: "The foreign-key target no longer exists in this draft.",
        });
      }
    }
  }

  return issues;
}

function serializeColumn(draft: GuidedDraftV1, column: GuidedColumnDraft): string {
  const clauses = [
    renderIdentifier(column.name),
    column.dataType.trim(),
    column.nullable ? null : "NOT NULL",
    column.defaultExpression === null
      ? null
      : `DEFAULT ${column.defaultExpression.trim()}`,
    column.primaryKey ? "PRIMARY KEY" : null,
    column.unique ? "UNIQUE" : null,
    referenceClause(draft, column),
  ].filter((value): value is string => value !== null);

  return `  ${clauses.join(" ")}`;
}

function serializeTable(draft: GuidedDraftV1, table: GuidedTableDraft): string {
  const qualifiedName = `${renderIdentifier(draft.namespace)}.${renderIdentifier(table.name)}`;
  const columns = table.columns.map((column) => serializeColumn(draft, column));
  return `CREATE TABLE ${qualifiedName} (\n${columns.join(",\n")}\n);`;
}

export function serializeGuidedDraftToPostgresSql(
  draft: GuidedDraftV1,
): GuidedSqlSerializationResult {
  const issues = validateDraft(draft);
  if (issues.length > 0) {
    return { status: "invalid-draft", output: null, canExport: false, issues };
  }

  const output: GeneratedGuidedSqlV1 = {
    version: GUIDED_SQL_SERIALIZATION_VERSION,
    dialect: "postgresql",
    source: `${draft.tables.map((table) => serializeTable(draft, table)).join("\n\n")}\n`,
    canExport: false,
    requiresCanonicalValidation: true,
  };

  return { status: "generated", output, issues: [] };
}

export function guidedIdentifierNormalizedName(
  identifier: GuidedIdentifierDraft,
): string {
  return normalizedIdentifier(identifier);
}
