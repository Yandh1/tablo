export interface AdapterToken {
  kind: string;
  text: string;
  startByte: number;
  endByte: number;
}

export interface AdapterRelation {
  catalogName: string | null;
  schemaName: string | null;
  normalizedName: string;
  locationByte: number;
}

export interface AdapterType {
  normalizedParts: string[];
  locationByte: number;
  arrayDimensions: number;
}

export type AdapterConstraintKind =
  | "primary-key"
  | "not-null"
  | "unique"
  | "foreign-key"
  | "check"
  | "identity"
  | "default"
  | "generated"
  | "other";

export interface AdapterConstraint {
  kind: AdapterConstraintKind;
  name: string | null;
  locationByte: number;
  localColumns: string[];
  referencedRelation: AdapterRelation | null;
  referencedColumns: string[];
  hasUnsupportedForeignKeyOptions: boolean;
}

export interface AdapterColumn {
  normalizedName: string;
  locationByte: number;
  type: AdapterType;
  constraints: AdapterConstraint[];
  hasUnsupportedCollation: boolean;
}

export interface AdapterCreateTableStatement {
  kind: "create-table";
  startByte: number;
  endByte: number;
  relation: AdapterRelation;
  columns: AdapterColumn[];
  constraints: AdapterConstraint[];
  hasUnsupportedTableFeatures: boolean;
}

export interface AdapterUnsupportedStatement {
  kind: "unsupported";
  statementKind: string;
  startByte: number;
  endByte: number;
}

export type AdapterStatement =
  | AdapterCreateTableStatement
  | AdapterUnsupportedStatement;

export type AdapterParseResult =
  | { status: "parsed"; tokens: AdapterToken[]; statements: AdapterStatement[] }
  | {
      status: "invalid";
      tokens: AdapterToken[];
      /** The package exposes parse-error positions in JavaScript UTF-16 offsets. */
      error: { kind: "syntax" | "semantic" | "unknown"; message: string; positionUtf16: number };
    }
  | {
      status: "failed";
      tokens: AdapterToken[];
      error: { message: string; positionUtf16: number };
    };

export interface Pg17VendorAdapter {
  parse(source: string): Promise<AdapterParseResult>;
}
