import type { Diagnostic, Identifier, SourceSpan } from "../schema-ir";

export const PARSED_SCHEMA_VERSION = 1 as const;
export const PARSER_DIAGNOSTICS_VERSION = 1 as const;

export type ParsedTableId = string;
export type ParsedColumnId = string;
export type ParsedRelationshipId = string;

export interface ParsedDataType {
  /** Exact trimmed spelling from the source, including modifiers and arrays. */
  displayName: string;
  /** Parser-neutral canonical name for the supported built-in base type. */
  normalizedName: string;
  sourceSpan: SourceSpan;
}

export interface ParsedColumn {
  id: ParsedColumnId;
  name: Identifier;
  ordinal: number;
  dataType: ParsedDataType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  sourceSpan: SourceSpan;
}

export interface ParsedTable {
  id: ParsedTableId;
  name: Identifier;
  columns: ParsedColumn[];
  sourceSpan: SourceSpan;
}

export interface ParsedRelationship {
  id: ParsedRelationshipId;
  sourceTableId: ParsedTableId;
  sourceColumnId: ParsedColumnId;
  targetTableId: ParsedTableId;
  targetColumnId: ParsedColumnId;
  sourceSpan: SourceSpan;
}

/**
 * Minimal, parser-neutral projection needed by a diagram adapter.
 * It is deliberately not SchemaIR and is never directly exportable.
 */
export interface ParsedSchemaV1 {
  version: typeof PARSED_SCHEMA_VERSION;
  dialect: "postgresql";
  tables: ParsedTable[];
  relationships: ParsedRelationship[];
  exportEligibility: "requires-schema-ir-validation";
}

export type ParsedSchema = ParsedSchemaV1;
export type ParserDiagnostic = Diagnostic;

export interface ParserDiagnosticSetV1 {
  version: typeof PARSER_DIAGNOSTICS_VERSION;
  diagnostics: ParserDiagnostic[];
}

export type ParseSchemaResultV1 =
  | {
      status: "parsed" | "parsed-with-warnings";
      schema: ParsedSchemaV1;
      diagnostics: ParserDiagnosticSetV1;
    }
  | {
      status: "invalid" | "failed";
      schema: null;
      diagnostics: ParserDiagnosticSetV1;
    };

export interface SchemaParser {
  parse(source: string): Promise<ParseSchemaResultV1>;
}

