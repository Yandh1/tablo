"use client";

import {
  createGuidedColumnDraft,
  createGuidedDraft,
  createGuidedTableDraft,
  serializeGuidedDraftToPostgresSql,
  type GuidedColumnDraft,
  type GuidedDraftV1,
  type GuidedReferenceDraft,
  type GuidedTableDraft,
} from "@/domain/guided-draft";
import type { ReferentialAction } from "@/domain/schema-ir";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import styles from "./guided-editor.module.css";

const REFERENTIAL_ACTIONS: Array<{
  value: ReferentialAction;
  label: string;
}> = [
  { value: "no-action", label: "No action" },
  { value: "restrict", label: "Restrict" },
  { value: "cascade", label: "Cascade" },
  { value: "set-null", label: "Set null" },
  { value: "set-default", label: "Set default" },
];

type AuthoringMode = "guided" | "manual";

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

export function GuidedEditor() {
  const [mode, setMode] = useState<AuthoringMode>("guided");
  const [draft, setDraft] = useState<GuidedDraftV1>(() =>
    createGuidedDraft("commerce-schema"),
  );
  const [announcement, setAnnouncement] = useState(
    "Guided mode ready with one protected table.",
  );
  const nextTableOrdinalRef = useRef(nextOrdinal(draft.tables));
  const nextColumnOrdinalByTableRef = useRef(new Map<string, number>());
  const serialization = useMemo(
    () => serializeGuidedDraftToPostgresSql(draft),
    [draft],
  );

  const updateDraft = (update: (next: GuidedDraftV1) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      update(next);
      return next;
    });
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

  const deleteColumn = (tableIndex: number, columnIndex: number) => {
    const column = draft.tables[tableIndex]?.columns[columnIndex];
    if (!column) return;
    updateDraft((next) => {
      next.tables[tableIndex]!.columns.splice(columnIndex, 1);
      for (const table of next.tables) {
        for (const candidate of table.columns) {
          if (candidate.references?.columnDraftId === column.id) {
            candidate.references = null;
          }
        }
      }
    });
    setAnnouncement("Column deleted.");
  };

  const moveColumn = (
    tableIndex: number,
    columnIndex: number,
    direction: -1 | 1,
  ) => {
    const targetIndex = columnIndex + direction;
    const table = draft.tables[tableIndex];
    if (!table || targetIndex < 0 || targetIndex >= table.columns.length) return;
    updateDraft((next) => {
      const columns = next.tables[tableIndex]!.columns;
      const [column] = columns.splice(columnIndex, 1);
      columns.splice(targetIndex, 0, column!);
    });
    setAnnouncement(
      `Column moved ${direction === -1 ? "up" : "down"}.`,
    );
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    tableIndex: number,
    columnIndex: number,
  ) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    moveColumn(tableIndex, columnIndex, event.key === "ArrowUp" ? -1 : 1);
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
            ? "Structured fields generate SQL. Alt+Up/Down reorders columns"
            : "Manual editing will be available with Monaco"}
        </span>
      </div>

      {mode === "manual" ? (
        <section className={styles.manualPlaceholder} aria-labelledby="manual-title">
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
                  onDeleteColumn={(columnIndex) => deleteColumn(tableIndex, columnIndex)}
                  onDeleteTable={() => deleteTable(tableIndex)}
                  onMoveColumn={(columnIndex, direction) =>
                    moveColumn(tableIndex, columnIndex, direction)
                  }
                  onRowKeyDown={(event, columnIndex) =>
                    handleRowKeyDown(event, tableIndex, columnIndex)
                  }
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

          <section className={styles.preview} aria-labelledby="generated-sql-title">
            <div className={styles.previewHeader}>
              <div>
                <h3 id="generated-sql-title">Generated SQL</h3>
                <p>Read-only preview. Canonical validation is still required.</p>
              </div>
              <span className={styles.previewState}>
                {serialization.status === "generated" ? "Ready to validate" : "Incomplete draft"}
              </span>
            </div>
            {serialization.status === "generated" ? (
              <textarea
                className={styles.sqlPreview}
                aria-label="Generated PostgreSQL SQL preview"
                readOnly
                spellCheck={false}
                value={serialization.output.source}
              />
            ) : (
              <div className={styles.issues} role="status">
                <p>Complete the required draft fields to generate SQL.</p>
                <ul>
                  {serialization.issues.map((issue, index) => (
                    <li key={`${issue.tableDraftId}-${issue.columnDraftId ?? "table"}-${issue.code}-${index}`}>
                      <code>{issue.code}</code> {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
      <p className={styles.srOnly} aria-live="polite">{announcement}</p>
    </div>
  );
}

function TableBlock({
  draft,
  table,
  tableIndex,
  onAddColumn,
  onDeleteColumn,
  onDeleteTable,
  onMoveColumn,
  onRowKeyDown,
  onUpdate,
}: {
  draft: GuidedDraftV1;
  table: GuidedTableDraft;
  tableIndex: number;
  onAddColumn: () => void;
  onDeleteColumn: (columnIndex: number) => void;
  onDeleteTable: () => void;
  onMoveColumn: (columnIndex: number, direction: -1 | 1) => void;
  onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, columnIndex: number) => void;
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
        <span>Column</span><span>Type</span><span>Null</span><span>Default</span>
        <span>Keys</span><span>Reference</span><span>Actions</span>
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
              table={table}
              onDelete={() => onDeleteColumn(columnIndex)}
              onKeyDown={(event) => onRowKeyDown(event, columnIndex)}
              onMove={(direction) => onMoveColumn(columnIndex, direction)}
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
  table,
  onDelete,
  onKeyDown,
  onMove,
  onUpdate,
}: {
  column: GuidedColumnDraft;
  columnIndex: number;
  draft: GuidedDraftV1;
  table: GuidedTableDraft;
  onDelete: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (update: (column: GuidedColumnDraft, draft: GuidedDraftV1) => void) => void;
}) {
  const reference = referenceValue(column.references);
  return (
    <div
      className={styles.columnRow}
      data-guided-draft-id={column.id}
      onKeyDown={onKeyDown}
      aria-label={`Column ${columnIndex + 1}`}
    >
      <label><span className={styles.srOnly}>Column name</span><input aria-label={`Column ${columnIndex + 1} name`} placeholder="column_name" value={column.name.value} onChange={(event) => onUpdate((next) => { next.name.value = event.target.value; })} /></label>
      <label><span className={styles.srOnly}>PostgreSQL type</span><input aria-label={`Column ${columnIndex + 1} type`} placeholder="text" value={column.dataType} onChange={(event) => onUpdate((next) => { next.dataType = event.target.value; })} /></label>
      <label className={styles.compactField}><span>Nullable</span><input type="checkbox" checked={column.nullable} onChange={(event) => onUpdate((next) => { next.nullable = event.target.checked; })} /></label>
      <label><span className={styles.srOnly}>Default expression</span><input aria-label={`Column ${columnIndex + 1} default expression`} placeholder="none" value={column.defaultExpression ?? ""} onChange={(event) => onUpdate((next) => { next.defaultExpression = event.target.value || null; })} /></label>
      <div className={styles.keyFields}>
        <label><input type="checkbox" checked={column.primaryKey} onChange={(event) => onUpdate((next) => { next.primaryKey = event.target.checked; })} /> PK</label>
        <label><input type="checkbox" checked={column.unique} onChange={(event) => onUpdate((next) => { next.unique = event.target.checked; })} /> UQ</label>
      </div>
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
      <div className={styles.rowActions}>
        <label>
          <span className={styles.srOnly}>On delete</span>
          <select aria-label={`Column ${columnIndex + 1} on delete`} disabled={!column.references} value={column.references?.onDelete ?? "no-action"} onChange={(event) => onUpdate((next) => { if (next.references) next.references.onDelete = event.target.value as ReferentialAction; })}>
            {REFERENTIAL_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
          </select>
        </label>
        <label>
          <span className={styles.srOnly}>On update</span>
          <select aria-label={`Column ${columnIndex + 1} on update`} disabled={!column.references} value={column.references?.onUpdate ?? "no-action"} onChange={(event) => onUpdate((next) => { if (next.references) next.references.onUpdate = event.target.value as ReferentialAction; })}>
            {REFERENTIAL_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
          </select>
        </label>
        <div className={styles.reorderActions}>
          <button type="button" aria-label={`Move column ${columnIndex + 1} up`} disabled={columnIndex === 0} onClick={() => onMove(-1)}>Up</button>
          <button type="button" aria-label={`Move column ${columnIndex + 1} down`} disabled={columnIndex === table.columns.length - 1} onClick={() => onMove(1)}>Down</button>
          <button type="button" aria-label={`Delete column ${columnIndex + 1}`} onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}
