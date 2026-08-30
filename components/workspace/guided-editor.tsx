"use client";

import {
  createGuidedColumnDraft,
  createGuidedDraft,
  createGuidedTableDraft,
  type GuidedColumnDraft,
  type GuidedDraftV1,
  type GuidedReferenceDraft,
  type GuidedTableDraft,
} from "@/domain/guided-draft";
import { useRef, useState, type ReactNode } from "react";

import styles from "./guided-editor.module.css";

export type AuthoringMode = "guided" | "manual";

interface GuidedEditorProps {
  draft?: GuidedDraftV1;
  mode?: AuthoringMode;
  manualContent?: ReactNode;
  problemsContent?: ReactNode;
  onDraftChange?: (draft: GuidedDraftV1) => void;
  onModeChange?: (mode: AuthoringMode) => void;
}

function nextOrdinal(items: Array<{ creationOrdinal: number }>) {
  return items.reduce(
    (highest, item) => Math.max(highest, item.creationOrdinal),
    -1,
  ) + 1;
}

function referenceValue(reference: GuidedReferenceDraft | null) {
  return reference
    ? JSON.stringify([reference.tableDraftId, reference.columnDraftId])
    : "";
}

function parseReferenceValue(
  value: string,
): Pick<GuidedReferenceDraft, "tableDraftId" | "columnDraftId"> | null {
  if (!value) return null;
  const [tableDraftId, columnDraftId] = JSON.parse(value) as [
    GuidedReferenceDraft["tableDraftId"],
    GuidedReferenceDraft["columnDraftId"],
  ];
  return { tableDraftId, columnDraftId };
}

export function GuidedEditor({
  draft: controlledDraft,
  mode: controlledMode,
  manualContent,
  problemsContent,
  onDraftChange,
  onModeChange,
}: GuidedEditorProps = {}) {
  const [internalMode, setInternalMode] = useState<AuthoringMode>("guided");
  const [internalDraft, setInternalDraft] = useState<GuidedDraftV1>(() =>
    createGuidedDraft("commerce-schema"),
  );
  const mode = controlledMode ?? internalMode;
  const draft = controlledDraft ?? internalDraft;
  const [announcement, setAnnouncement] = useState(
    "Guided mode ready with one protected table.",
  );
  const nextTableOrdinalRef = useRef(nextOrdinal(draft.tables));
  const nextColumnOrdinalByTableRef = useRef(new Map<string, number>());

  const updateDraft = (update: (next: GuidedDraftV1) => void) => {
    const next = structuredClone(draft);
    update(next);
    if (controlledDraft === undefined) setInternalDraft(next);
    onDraftChange?.(next);
  };

  const setMode = (next: AuthoringMode) => {
    if (controlledMode === undefined) setInternalMode(next);
    onModeChange?.(next);
  };

  const addTable = (insertAfterIndex: number) => {
    updateDraft((next) => {
      const table = createGuidedTableDraft(next, nextTableOrdinalRef.current);
      nextTableOrdinalRef.current += 1;
      next.tables.splice(insertAfterIndex + 1, 0, table);
    });
    setAnnouncement("Table added. Enter a table name to continue.");
  };

  const deleteTable = (tableIndex: number) => {
    const table = draft.tables[tableIndex];
    if (!table || table.protected) return;
    updateDraft((next) => {
      next.tables.splice(tableIndex, 1);
      for (const candidate of next.tables) {
        for (const column of candidate.columns) {
          if (column.references?.tableDraftId === table.id) {
            column.references = null;
          }
        }
      }
    });
    setAnnouncement("Table deleted.");
  };

  const addColumn = (tableIndex: number) => {
    const table = draft.tables[tableIndex];
    if (!table) return;
    updateDraft((next) => {
      const nextTable = next.tables[tableIndex]!;
      const creationOrdinal =
        nextColumnOrdinalByTableRef.current.get(nextTable.id) ??
        nextOrdinal(nextTable.columns);
      nextTable.columns.push(
        createGuidedColumnDraft(nextTable, creationOrdinal),
      );
      nextColumnOrdinalByTableRef.current.set(
        nextTable.id,
        creationOrdinal + 1,
      );
    });
    setAnnouncement(
      `Column added to ${table.name.value || "untitled table"}.`,
    );
  };

  return (
    <div className={styles.editor}>
      <div className={styles.modeBar}>
        <div className={styles.modeChoice} role="radiogroup" aria-label="Authoring mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "guided"}
            className={styles.modeButton}
            onClick={() => setMode("guided")}
          >
            Guided blocks
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "manual"}
            className={styles.modeButton}
            onClick={() => setMode("manual")}
          >
            Manual SQL
          </button>
        </div>
        <span className={styles.modeHelp}>
          {mode === "guided"
            ? "Structured fields are parsed as PostgreSQL SQL"
            : "PostgreSQL SQL with live diagnostics"}
        </span>
      </div>

      {mode === "manual" ? (
        manualContent ?? <section className={styles.manualPlaceholder} aria-labelledby="manual-title">
          <h3 id="manual-title">Manual SQL</h3>
          <p>
            Monaco is not part of this slice. Your Guided draft remains intact when
            you return to Guided blocks.
          </p>
          <button type="button" onClick={() => setMode("guided")}>Return to Guided blocks</button>
        </section>
      ) : (
        <div className={styles.guidedLayout}>
          <div className={styles.tableList} aria-label="Guided schema tables">
            {draft.tables.map((table, tableIndex) => (
              <div className={styles.tableSequence} key={table.id}>
                <TableBlock
                  draft={draft}
                  table={table}
                  tableIndex={tableIndex}
                  onAddColumn={() => addColumn(tableIndex)}
                  onDeleteTable={() => deleteTable(tableIndex)}
                  onUpdate={(update) =>
                    updateDraft((next) => update(next.tables[tableIndex]!, next))
                  }
                />
                <div className={styles.addTableRail}>
                  <button
                    className={styles.addTableButton}
                    type="button"
                    onClick={() => addTable(tableIndex)}
                  >
                    <span aria-hidden="true">+</span> Add table
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {problemsContent}
      <p className={styles.srOnly} aria-live="polite">{announcement}</p>
    </div>
  );
}

function TableBlock({
  draft,
  table,
  tableIndex,
  onAddColumn,
  onDeleteTable,
  onUpdate,
}: {
  draft: GuidedDraftV1;
  table: GuidedTableDraft;
  tableIndex: number;
  onAddColumn: () => void;
  onDeleteTable: () => void;
  onUpdate: (update: (table: GuidedTableDraft, draft: GuidedDraftV1) => void) => void;
}) {
  const label = table.name.value || `Untitled table ${tableIndex + 1}`;
  return (
    <fieldset className={styles.tableBlock} data-guided-draft-id={table.id}>
      <legend className={styles.srOnly}>{label}</legend>
      <div className={styles.tableHeader}>
        <div className={styles.structuralLine}>
          <code aria-hidden="true">CREATE TABLE public.</code>
          <label className={styles.tableNameField}>
            <span className={styles.srOnly}>Table name</span>
            <input
              aria-label={`Table ${tableIndex + 1} name`}
              autoComplete="off"
              placeholder="table_name"
              value={table.name.value}
              onChange={(event) =>
                onUpdate((nextTable) => {
                  nextTable.name.value = event.target.value;
                })
              }
            />
          </label>
          <code aria-hidden="true"> (</code>
        </div>
        {table.protected ? (
          <span className={styles.protectedLabel}>Protected first table</span>
        ) : (
          <button className={styles.deleteTableButton} type="button" onClick={onDeleteTable}>
            Delete table
          </button>
        )}
      </div>

      <div className={styles.columnHeader} aria-hidden="true">
        <span>Column</span><span>Type</span><span>Not null</span>
        <span>Primary key</span><span>Unique</span><span>Reference</span>
      </div>
      {table.columns.length === 0 ? (
        <p className={styles.emptyColumns}>No columns yet. Add a column to define this table.</p>
      ) : (
        <div className={styles.columns}>
          {table.columns.map((column, columnIndex) => (
            <ColumnRow
              key={column.id}
              column={column}
              columnIndex={columnIndex}
              draft={draft}
              onUpdate={(update) =>
                onUpdate((nextTable, nextDraft) =>
                  update(nextTable.columns[columnIndex]!, nextDraft),
                )
              }
            />
          ))}
        </div>
      )}
      <div className={styles.tableFooter}>
        <code aria-hidden="true">);</code>
        <button className={styles.addColumnButton} type="button" onClick={onAddColumn}>
          <span aria-hidden="true">+</span> Add column
        </button>
      </div>
    </fieldset>
  );
}

function ColumnRow({
  column,
  columnIndex,
  draft,
  onUpdate,
}: {
  column: GuidedColumnDraft;
  columnIndex: number;
  draft: GuidedDraftV1;
  onUpdate: (update: (column: GuidedColumnDraft, draft: GuidedDraftV1) => void) => void;
}) {
  const reference = referenceValue(column.references);
  return (
    <div
      className={styles.columnRow}
      data-guided-draft-id={column.id}
      aria-label={`Column ${columnIndex + 1}`}
    >
      <label><span className={styles.srOnly}>Column name</span><input aria-label={`Column ${columnIndex + 1} name`} placeholder="column_name" value={column.name.value} onChange={(event) => onUpdate((next) => { next.name.value = event.target.value; })} /></label>
      <label><span className={styles.srOnly}>PostgreSQL type</span><input aria-label={`Column ${columnIndex + 1} type`} placeholder="text" value={column.dataType} onChange={(event) => onUpdate((next) => { next.dataType = event.target.value; })} /></label>
      <label className={styles.compactField}><span>Not null</span><input type="checkbox" checked={!column.nullable} onChange={(event) => onUpdate((next) => { next.nullable = !event.target.checked; })} /></label>
      <label className={styles.compactField}><span>Primary key</span><input type="checkbox" checked={column.primaryKey} onChange={(event) => onUpdate((next) => { next.primaryKey = event.target.checked; })} /></label>
      <label className={styles.compactField}><span>Unique</span><input type="checkbox" checked={column.unique} onChange={(event) => onUpdate((next) => { next.unique = event.target.checked; })} /></label>
      <label>
        <span className={styles.srOnly}>Reference target</span>
        <select
          aria-label={`Column ${columnIndex + 1} reference target`}
          value={reference}
          onChange={(event) => {
            const target = parseReferenceValue(event.target.value);
            onUpdate((next) => {
              next.references = target
                ? { ...target, onDelete: "no-action", onUpdate: "no-action" }
                : null;
            });
          }}
        >
          <option value="">No reference</option>
          {draft.tables.flatMap((candidateTable) =>
            candidateTable.columns
              .filter((candidateColumn) => candidateColumn.id !== column.id)
              .map((candidateColumn) => (
                <option
                  key={candidateColumn.id}
                  value={JSON.stringify([candidateTable.id, candidateColumn.id])}
                >
                  {candidateTable.name.value || "Untitled table"}.{candidateColumn.name.value || "untitled_column"}
                </option>
              )),
          )}
        </select>
      </label>
    </div>
  );
}
