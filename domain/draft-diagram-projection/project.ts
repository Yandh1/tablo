import type { GuidedDraftV1 } from "../guided-draft";
import {
  DRAFT_DIAGRAM_PROJECTION_VERSION,
  type DraftDiagramProjectionV1,
} from "./types";

export function projectGuidedDraft(
  draft: GuidedDraftV1,
): DraftDiagramProjectionV1 {
  return {
    kind: "draft-diagram-projection",
    version: DRAFT_DIAGRAM_PROJECTION_VERSION,
    source: "guided-draft",
    exportEligibility: "not-exportable",
    tables: draft.tables.map((table) => ({
      kind: "provisional-draft-table",
      draftTableId: table.id,
      statusLabel: "Draft",
      label: table.name.value || "Untitled table",
      emptyInstruction:
        table.columns.length === 0 ? "Add a column to define this table." : null,
      columns: table.columns.map((column) => ({
        kind: "provisional-draft-column",
        draftColumnId: column.id,
        label: column.name.value || "Untitled column",
        dataTypeLabel: column.dataType || "Choose a data type",
      })),
    })),
  };
}
