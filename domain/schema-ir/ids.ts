import type {
  ColumnId,
  ConstraintId,
  NamespaceId,
  SchemaId,
  TableId,
} from "./types";

type CanonicalPart = string | readonly string[] | null;

function encodePart(part: CanonicalPart): string {
  if (Array.isArray(part)) {
    return `[${part.map((value) => encodePart(value)).join("")}]`;
  }

  if (part === null) {
    return "-";
  }

  return `${part.length}:${part}`;
}

function canonicalId(kind: string, parts: readonly CanonicalPart[]): string {
  return `schema-ir:v1:${kind}:${parts.map((part) => encodePart(part)).join("|")}`;
}

export function schemaId(): SchemaId {
  return canonicalId("schema", ["postgresql"]);
}

export function namespaceId(normalizedName: string): NamespaceId {
  return canonicalId("namespace", [normalizedName]);
}

export function tableId(
  owningNamespaceId: NamespaceId,
  normalizedName: string,
): TableId {
  return canonicalId("table", [owningNamespaceId, normalizedName]);
}

export function columnId(
  owningTableId: TableId,
  normalizedName: string,
): ColumnId {
  return canonicalId("column", [owningTableId, normalizedName]);
}

export interface KeyConstraintIdentityInput {
  tableId: TableId;
  normalizedName: string | null;
  orderedColumnIds: readonly ColumnId[];
}

export function primaryKeyId(input: KeyConstraintIdentityInput): ConstraintId {
  return canonicalId("primary-key", [
    input.tableId,
    input.normalizedName,
    input.orderedColumnIds,
  ]);
}

export function uniqueConstraintId(
  input: KeyConstraintIdentityInput,
): ConstraintId {
  return canonicalId("unique", [
    input.tableId,
    input.normalizedName,
    input.orderedColumnIds,
  ]);
}

export interface ForeignKeyIdentityInput extends KeyConstraintIdentityInput {
  referencedTableId: TableId;
  orderedReferencedColumnIds: readonly ColumnId[];
}

export function foreignKeyId(input: ForeignKeyIdentityInput): ConstraintId {
  return canonicalId("foreign-key", [
    input.tableId,
    input.normalizedName,
    input.orderedColumnIds,
    input.referencedTableId,
    input.orderedReferencedColumnIds,
  ]);
}

export function checkConstraintId(input: {
  tableId: TableId;
  normalizedName: string | null;
  normalizedExpression: string;
}): ConstraintId {
  return canonicalId("check", [
    input.tableId,
    input.normalizedName,
    input.normalizedExpression,
  ]);
}
