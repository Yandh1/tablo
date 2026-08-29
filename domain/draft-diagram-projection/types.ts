import type {
  GuidedColumnDraftId,
  GuidedTableDraftId,
} from "../guided-draft";

export const DRAFT_DIAGRAM_PROJECTION_VERSION = 1 as const;

export interface ProvisionalDraftColumn {
  kind: "provisional-draft-column";
  draftColumnId: GuidedColumnDraftId;
  label: string;
  dataTypeLabel: string;
}

export interface ProvisionalDraftTable {
  kind: "provisional-draft-table";
  draftTableId: GuidedTableDraftId;
  statusLabel: "Draft";
  label: string;
  emptyInstruction: string | null;
  columns: ProvisionalDraftColumn[];
}

export interface DraftDiagramProjectionV1 {
  kind: "draft-diagram-projection";
  version: typeof DRAFT_DIAGRAM_PROJECTION_VERSION;
  source: "guided-draft";
  exportEligibility: "not-exportable";
  tables: ProvisionalDraftTable[];
}
