import type { ReferentialAction } from "../schema-ir";

export const GUIDED_DRAFT_VERSION = 1 as const;
export const GUIDED_SQL_SERIALIZATION_VERSION = 1 as const;

declare const guidedDraftIdBrand: unique symbol;
declare const guidedTableDraftIdBrand: unique symbol;
declare const guidedColumnDraftIdBrand: unique symbol;

export type GuidedDraftId = string & { readonly [guidedDraftIdBrand]: true };
export type GuidedTableDraftId = string & {
  readonly [guidedTableDraftIdBrand]: true;
};
export type GuidedColumnDraftId = string & {
  readonly [guidedColumnDraftIdBrand]: true;
};

export interface GuidedIdentifierDraft {
  /** Editable value only. Empty strings are valid draft state. */
  value: string;
  quoted: boolean;
}

export interface GuidedReferenceDraft {
  tableDraftId: GuidedTableDraftId;
  columnDraftId: GuidedColumnDraftId;
  onUpdate: ReferentialAction;
  onDelete: ReferentialAction;
}

export interface GuidedColumnDraft {
  kind: "guided-column-draft";
  id: GuidedColumnDraftId;
  creationOrdinal: number;
  name: GuidedIdentifierDraft;
  dataType: string;
  nullable: boolean;
  defaultExpression: string | null;
  primaryKey: boolean;
  unique: boolean;
  references: GuidedReferenceDraft | null;
}

export interface GuidedTableDraft {
  kind: "guided-table-draft";
  id: GuidedTableDraftId;
  creationOrdinal: number;
  /** The protected first shell has this set and may remain completely empty. */
  protected: boolean;
  name: GuidedIdentifierDraft;
  columns: GuidedColumnDraft[];
}

export interface GuidedDraftV1 {
  kind: "guided-draft";
  version: typeof GUIDED_DRAFT_VERSION;
  id: GuidedDraftId;
  dialect: "postgresql";
  namespace: GuidedIdentifierDraft;
  tables: GuidedTableDraft[];
}

export type GuidedDraft = GuidedDraftV1;

export interface GuidedDraftIssue {
  code:
    | "empty-table-name"
    | "empty-table-columns"
    | "empty-column-name"
    | "empty-data-type"
    | "invalid-identifier"
    | "duplicate-table-name"
    | "duplicate-column-name"
    | "missing-reference-target";
  tableDraftId: GuidedTableDraftId;
  columnDraftId?: GuidedColumnDraftId;
  message: string;
}

export interface GeneratedGuidedSqlV1 {
  version: typeof GUIDED_SQL_SERIALIZATION_VERSION;
  dialect: "postgresql";
  source: string;
  /** Generated source still requires parsing and canonical validation. */
  canExport: false;
  requiresCanonicalValidation: true;
}

export type GuidedSqlSerializationResult =
  | {
      status: "generated";
      output: GeneratedGuidedSqlV1;
      issues: [];
    }
  | {
      status: "invalid-draft";
      output: null;
      canExport: false;
      issues: GuidedDraftIssue[];
    };
