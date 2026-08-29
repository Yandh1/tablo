import type {
  GuidedColumnDraftId,
  GuidedDraftId,
  GuidedTableDraftId,
} from "./types";

function encode(value: string | number): string {
  const text = String(value);
  return `${text.length}:${text}`;
}

export function guidedDraftId(projectScope: string): GuidedDraftId {
  return `guided-draft:v1:document:${encode(projectScope)}` as GuidedDraftId;
}

export function guidedTableDraftId(
  draftId: GuidedDraftId,
  creationOrdinal: number,
): GuidedTableDraftId {
  return `guided-draft:v1:table:${encode(draftId)}|${encode(creationOrdinal)}` as GuidedTableDraftId;
}

export function guidedColumnDraftId(
  tableDraftId: GuidedTableDraftId,
  creationOrdinal: number,
): GuidedColumnDraftId {
  return `guided-draft:v1:column:${encode(tableDraftId)}|${encode(creationOrdinal)}` as GuidedColumnDraftId;
}
