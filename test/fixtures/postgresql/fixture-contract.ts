/**
 * Parser-vendor-neutral review contract for PostgreSQL fixtures.
 *
 * These are logical expectations, not parser ASTs and not complete SchemaIR.
 * A parser adapter will derive canonical SchemaIR IDs with domain/schema-ir/ids.
 */
export type FixtureOutcome =
  | "parse-success"
  | "parse-success-with-warnings"
  | "syntax-error"
  | "semantic-error";

export type FixtureFeature =
  | "alter-table-add-constraint"
  | "arrays"
  | "built-in-types"
  | "comments"
  | "composite-keys"
  | "create-table"
  | "defaults"
  | "identifier-normalization"
  | "inline-foreign-key"
  | "inline-primary-key"
  | "later-semantic-error"
  | "malformed-supported-statement"
  | "multiple-statements"
  | "parallel-foreign-keys"
  | "quoted-identifiers"
  | "referential-actions"
  | "self-references"
  | "table-foreign-key"
  | "table-primary-key"
  | "type-modifiers"
  | "unique-constraints"
  | "unquoted-identifiers"
  | "unsupported-statements";

export interface SourceAnchorExpectation {
  /** Exact source text. `occurrence` is one-based and defaults to 1. */
  anchor: string;
  occurrence?: number;
  startLine: number;
}

export interface IdentifierExpectation {
  displayName: string;
  normalizedName: string;
  quoted: boolean;
}

export interface DataTypeExpectation {
  displayName: string;
  normalizedName: string;
  modifiers: { displayValue: string; normalizedValue: string }[];
  arrayDimensions: number;
}

export interface ColumnExpectation {
  name: IdentifierExpectation;
  ordinal: number;
  type: DataTypeExpectation;
  nullable: boolean;
  defaultExpression: string | null;
  span: SourceAnchorExpectation;
}

export interface KeyExpectation {
  name: string | null;
  columns: string[];
  span: SourceAnchorExpectation;
}

export interface ForeignKeyExpectation extends KeyExpectation {
  referencedNamespace: string;
  referencedTable: string;
  referencedColumns: string[];
  match: "simple" | "full" | "partial";
  onUpdate: "no-action" | "restrict" | "cascade" | "set-null" | "set-default";
  onDelete: "no-action" | "restrict" | "cascade" | "set-null" | "set-default";
}

export interface TableExpectation {
  name: IdentifierExpectation;
  span: SourceAnchorExpectation;
  columns: ColumnExpectation[];
  constraints: {
    primaryKey: KeyExpectation | null;
    unique: KeyExpectation[];
    foreignKeys: ForeignKeyExpectation[];
  };
}

export interface NamespaceExpectation {
  name: IdentifierExpectation;
  tables: TableExpectation[];
}

export interface DiagnosticExpectation {
  code: string;
  severity: "error" | "warning" | "info";
  /** Reviewable semantic intent; adapters may improve wording without changing meaning. */
  messageIntent: string;
  span: SourceAnchorExpectation;
  why: string;
  how: string;
  related?: { messageIntent: string; span: SourceAnchorExpectation }[];
}

export interface PostgresFixtureExpectationV1 {
  fixtureVersion: 1;
  outcome: FixtureOutcome;
  features: FixtureFeature[];
  namespaces: NamespaceExpectation[];
  diagnostics: DiagnosticExpectation[];
}
