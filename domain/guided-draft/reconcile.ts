import type { Column, Namespace, SchemaIRV1, Table } from "../schema-ir";
import { guidedIdentifierNormalizedName, serializeGuidedDraftToPostgresSql } from "./serialize";
import type {
  GuidedColumnDraftId,
  GuidedDraftIssue,
  GuidedDraftV1,
  GuidedTableDraftId,
} from "./types";

export interface GuidedColumnIdentityMapping {
  draftColumnId: GuidedColumnDraftId;
  canonicalColumnId: Column["id"];
}

export interface GuidedTableIdentityMapping {
  draftTableId: GuidedTableDraftId;
  canonicalTableId: Table["id"];
  columns: GuidedColumnIdentityMapping[];
}

export interface GuidedCanonicalIdentityMapV1 {
  version: 1;
  schemaId: SchemaIRV1["id"];
  tables: GuidedTableIdentityMapping[];
}

export type GuidedReconciliationResult =
  | { status: "reconciled"; identities: GuidedCanonicalIdentityMapV1 }
  | {
      status: "not-reconciled";
      reason: "invalid-draft" | "canonical-shape-mismatch";
      issues: GuidedDraftIssue[];
    };

function matchingNamespace(
  draft: GuidedDraftV1,
  schema: SchemaIRV1,
): Namespace | undefined {
  const normalizedName = guidedIdentifierNormalizedName(draft.namespace);
  return schema.namespaces.find(
    (namespace) => namespace.name.normalizedName === normalizedName,
  );
}

export function reconcileGuidedDraftWithSchemaIR(
  draft: GuidedDraftV1,
  schema: SchemaIRV1,
): GuidedReconciliationResult {
  const serialization = serializeGuidedDraftToPostgresSql(draft);
  if (serialization.status === "invalid-draft") {
    return {
      status: "not-reconciled",
      reason: "invalid-draft",
      issues: serialization.issues,
    };
  }

  const namespace = matchingNamespace(draft, schema);
  if (!namespace || namespace.tables.length !== draft.tables.length) {
    return {
      status: "not-reconciled",
      reason: "canonical-shape-mismatch",
      issues: [],
    };
  }

  const tables: GuidedTableIdentityMapping[] = [];
  for (const draftTable of draft.tables) {
    const normalizedTableName = guidedIdentifierNormalizedName(draftTable.name);
    const canonicalTable = namespace.tables.find(
      (table) => table.name.normalizedName === normalizedTableName,
    );
    if (!canonicalTable || canonicalTable.columns.length !== draftTable.columns.length) {
      return {
        status: "not-reconciled",
        reason: "canonical-shape-mismatch",
        issues: [],
      };
    }

    const columns: GuidedColumnIdentityMapping[] = [];
    for (const draftColumn of draftTable.columns) {
      const normalizedColumnName = guidedIdentifierNormalizedName(draftColumn.name);
      const canonicalColumn = canonicalTable.columns.find(
        (column) => column.name.normalizedName === normalizedColumnName,
      );
      if (!canonicalColumn) {
        return {
          status: "not-reconciled",
          reason: "canonical-shape-mismatch",
          issues: [],
        };
      }
      columns.push({
        draftColumnId: draftColumn.id,
        canonicalColumnId: canonicalColumn.id,
      });
    }

    tables.push({
      draftTableId: draftTable.id,
      canonicalTableId: canonicalTable.id,
      columns,
    });
  }

  return {
    status: "reconciled",
    identities: { version: 1, schemaId: schema.id, tables },
  };
}
