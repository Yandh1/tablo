import {
  guidedColumnDraftId,
  guidedDraftId,
  guidedTableDraftId,
} from "./ids";
import {
  GUIDED_DRAFT_VERSION,
  type GuidedColumnDraft,
  type GuidedDraftV1,
  type GuidedTableDraft,
} from "./types";

export function createGuidedDraft(projectScope: string): GuidedDraftV1 {
  const id = guidedDraftId(projectScope);
  const firstTableId = guidedTableDraftId(id, 0);

  return {
    kind: "guided-draft",
    version: GUIDED_DRAFT_VERSION,
    id,
    dialect: "postgresql",
    namespace: { value: "public", quoted: false },
    tables: [
      {
        kind: "guided-table-draft",
        id: firstTableId,
        creationOrdinal: 0,
        protected: true,
        name: { value: "", quoted: false },
        columns: [],
      },
    ],
  };
}

export function createGuidedTableDraft(
  draft: GuidedDraftV1,
  creationOrdinal: number,
): GuidedTableDraft {
  return {
    kind: "guided-table-draft",
    id: guidedTableDraftId(draft.id, creationOrdinal),
    creationOrdinal,
    protected: creationOrdinal === 0,
    name: { value: "", quoted: false },
    columns: [],
  };
}

export function createGuidedColumnDraft(
  table: GuidedTableDraft,
  creationOrdinal: number,
): GuidedColumnDraft {
  return {
    kind: "guided-column-draft",
    id: guidedColumnDraftId(table.id, creationOrdinal),
    creationOrdinal,
    name: { value: "", quoted: false },
    dataType: "",
    nullable: true,
    defaultExpression: null,
    primaryKey: false,
    unique: false,
    references: null,
  };
}
