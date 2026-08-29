/** Canonical, parser-agnostic PostgreSQL schema representation. */
export const SCHEMA_IR_VERSION = 1 as const;

export type SchemaIrVersion = typeof SCHEMA_IR_VERSION;
export type SchemaId = string;
export type NamespaceId = string;
export type TableId = string;
export type ColumnId = string;
export type ConstraintId = string;

export interface SourcePosition {
  /** Zero-based UTF-16 offset, matching Monaco's document model. */
  offset: number;
  /** One-based line number. */
  line: number;
  /** One-based column number. */
  column: number;
}

export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

export interface Identifier {
  /** User-facing PostgreSQL identifier with quotes removed and escapes decoded. */
  displayName: string;
  /** PostgreSQL comparison form: folded for unquoted names, exact for quoted names. */
  normalizedName: string;
  quoted: boolean;
  sourceSpan: SourceSpan;
}

export interface PostgresTypeModifier {
  displayValue: string;
  normalizedValue: string;
}

export interface PostgresDataType {
  displayName: string;
  normalizedName: string;
  modifiers: PostgresTypeModifier[];
  arrayDimensions: number;
  sourceSpan: SourceSpan;
}

export interface Column {
  id: ColumnId;
  name: Identifier;
  ordinal: number;
  dataType: PostgresDataType;
  nullable: boolean;
  defaultExpression: string | null;
  sourceSpan: SourceSpan;
}

export interface PrimaryKeyConstraint {
  kind: "primary-key";
  id: ConstraintId;
  name: Identifier | null;
  /** Ordered column identity is semantically significant. */
  columnIds: ColumnId[];
  sourceSpan: SourceSpan;
}

export interface UniqueConstraint {
  kind: "unique";
  id: ConstraintId;
  name: Identifier | null;
  /** Ordered column identity is semantically significant. */
  columnIds: ColumnId[];
  sourceSpan: SourceSpan;
}

export type ReferentialAction =
  | "no-action"
  | "restrict"
  | "cascade"
  | "set-null"
  | "set-default";

export type ForeignKeyMatch = "simple" | "full" | "partial";

export interface ForeignKeyConstraint {
  kind: "foreign-key";
  id: ConstraintId;
  name: Identifier | null;
  /** Ordered one-to-one mapping to referencedColumnIds. */
  columnIds: ColumnId[];
  referencedTableId: TableId;
  referencedColumnIds: ColumnId[];
  match: ForeignKeyMatch;
  onUpdate: ReferentialAction;
  onDelete: ReferentialAction;
  sourceSpan: SourceSpan;
}

export interface CheckConstraint {
  kind: "check";
  id: ConstraintId;
  name: Identifier | null;
  /** Preserved user-facing SQL expression. It is never executed by Tablo. */
  expression: string;
  /** Parser-adapter-produced canonical expression used only for stable identity. */
  normalizedExpression: string;
  sourceSpan: SourceSpan;
}

export interface TableConstraints {
  primaryKey: PrimaryKeyConstraint | null;
  unique: UniqueConstraint[];
  foreignKeys: ForeignKeyConstraint[];
  checks: CheckConstraint[];
}

export interface Table {
  id: TableId;
  namespaceId: NamespaceId;
  name: Identifier;
  /** Source order is preserved; ordinal values must be contiguous from zero. */
  columns: Column[];
  constraints: TableConstraints;
  sourceSpan: SourceSpan;
}

export interface Namespace {
  id: NamespaceId;
  name: Identifier;
  tables: Table[];
  /** Null for an implicit namespace such as PostgreSQL's default `public`. */
  sourceSpan: SourceSpan | null;
}

export interface SchemaIRV1 {
  version: SchemaIrVersion;
  dialect: "postgresql";
  id: SchemaId;
  source: {
    format: "postgresql-sql" | "simple-schema";
    /** Content digest supplied by the source boundary, not raw source text. */
    hash: string;
  };
  namespaces: Namespace[];
}

export type SchemaIR = SchemaIRV1;

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticLocation {
  message: string;
  range: SourceSpan;
}

export interface DiagnosticFixHint {
  why: string;
  how: string;
  example?: string;
}

export interface Diagnostic {
  /** Stable product code, for example PGSD1203. */
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  range: SourceSpan;
  relatedLocations: DiagnosticLocation[];
  fix: DiagnosticFixHint | null;
}

/** Diagnostics are revisioned independently from the last-valid canonical IR. */
export interface DiagnosticSetV1 {
  version: 1;
  sourceRevision: number;
  diagnostics: Diagnostic[];
}
