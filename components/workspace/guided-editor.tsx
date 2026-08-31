"use client";

import {
  createGuidedColumnDraft,
  createGuidedDraft,
  createGuidedTableDraft,
  serializeGuidedDraftToPostgresSql,
  type GuidedColumnDraft,
  type GuidedDraftIssue,
  type GuidedDraftV1,
  type GuidedReferenceDraft,
  type GuidedTableDraft,
} from "@/domain/guided-draft";
import {
  formatPostgresTypeSelection,
  GUIDED_POSTGRES_TYPE_CATALOG,
  parsePostgresTypeSelection,
  type PostgresTypeCatalogOption,
  type PostgresTypeSelection,
} from "@/domain/parser-postgresql/type-catalog";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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

interface DefaultSuggestion {
  label: string;
  value: string;
}

const DEFAULT_SUGGESTIONS: Readonly<Record<string, readonly DefaultSuggestion[]>> = {
  uuid: [{ label: "Random UUID", value: "gen_random_uuid()" }],
  timestamp: [
    { label: "Current transaction time", value: "now()" },
    { label: "Current timestamp", value: "CURRENT_TIMESTAMP" },
  ],
  "timestamp with time zone": [
    { label: "Current transaction time", value: "now()" },
    { label: "Current timestamp", value: "CURRENT_TIMESTAMP" },
  ],
  date: [{ label: "Current date", value: "CURRENT_DATE" }],
  time: [{ label: "Current time", value: "CURRENT_TIME" }],
  "time with time zone": [{ label: "Current time", value: "CURRENT_TIME" }],
  boolean: [
    { label: "True", value: "true" },
    { label: "False", value: "false" },
  ],
  smallint: [{ label: "Zero", value: "0" }],
  integer: [{ label: "Zero", value: "0" }],
  bigint: [{ label: "Zero", value: "0" }],
  numeric: [{ label: "Zero", value: "0" }],
  real: [{ label: "Zero", value: "0" }],
  "double precision": [{ label: "Zero", value: "0" }],
  money: [{ label: "Zero", value: "0" }],
  json: [
    { label: "Empty object", value: "'{}'::json" },
    { label: "Empty array", value: "'[]'::json" },
  ],
  jsonb: [
    { label: "Empty object", value: "'{}'::jsonb" },
    { label: "Empty array", value: "'[]'::jsonb" },
  ],
};

const KNOWN_CONTEXTUAL_DEFAULTS = new Set(
  Object.values(DEFAULT_SUGGESTIONS).flatMap((suggestions) =>
    suggestions.map((suggestion) => suggestion.value.toLowerCase())
  ),
);

function nextOrdinal(items: Array<{ creationOrdinal: number }>) {
  return items.reduce((highest, item) => Math.max(highest, item.creationOrdinal), -1) + 1;
}

function referenceValue(reference: GuidedReferenceDraft | null) {
  return reference
    ? JSON.stringify([reference.tableDraftId, reference.columnDraftId])
    : "";
}

function parseReferenceValue(value: string) {
  if (!value) return null;
  const [tableDraftId, columnDraftId] = JSON.parse(value) as [
    GuidedReferenceDraft["tableDraftId"],
    GuidedReferenceDraft["columnDraftId"],
  ];
  return { tableDraftId, columnDraftId };
}

export function defaultSuggestionsForPostgresType(dataType: string) {
  const selection = parsePostgresTypeSelection(dataType);
  return selection
    ? (DEFAULT_SUGGESTIONS[selection.option.canonicalName] ?? [])
    : [];
}

export function guidedDefaultCompatibilityMessage(
  dataType: string,
  defaultExpression: string | null,
) {
  if (!defaultExpression?.trim()) return null;
  const normalizedDefault = defaultExpression.trim().toLowerCase();
  if (!KNOWN_CONTEXTUAL_DEFAULTS.has(normalizedDefault)) return null;
  const supportedValues = new Set(
    defaultSuggestionsForPostgresType(dataType).map((item) => item.value.toLowerCase()),
  );
  return supportedValues.has(normalizedDefault)
    ? null
    : "This preset does not match the selected type. The value is retained for parser review.";
}

function issueIsIncomplete(issue: GuidedDraftIssue) {
  return [
    "empty-table-name",
    "empty-table-columns",
    "empty-column-name",
    "empty-data-type",
  ].includes(issue.code);
}

function tableStatus(issues: GuidedDraftIssue[]) {
  if (issues.some((issue) => !issueIsIncomplete(issue))) return "Invalid";
  return issues.length > 0 ? "Draft" : "Valid";
}

function tableKeySummary(table: GuidedTableDraft) {
  const parts = [
    table.columns.some((column) => column.primaryKey) ? "PK" : null,
    table.columns.some((column) => column.references) ? "FK" : null,
    table.columns.some((column) => column.unique) ? "UQ" : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : "No keys";
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
  const [announcement, setAnnouncement] = useState("Guided mode ready with one protected table.");
  const [expandedTableId, setExpandedTableId] = useState<string>(draft.tables[0]?.id ?? "");
  const activeExpandedTableId = draft.tables.some((table) => table.id === expandedTableId)
    ? expandedTableId
    : (draft.tables[0]?.id ?? "");
  const nextTableOrdinalRef = useRef(nextOrdinal(draft.tables));
  const nextColumnOrdinalByTableRef = useRef(new Map<string, number>());
  const pendingFocusTableIdRef = useRef<string | null>(null);
  const tableNameRefs = useRef(new Map<string, HTMLInputElement>());
  const serialization = useMemo(() => serializeGuidedDraftToPostgresSql(draft), [draft]);
  const issuesByTable = useMemo(() => {
    const result = new Map<string, GuidedDraftIssue[]>();
    for (const issue of serialization.issues) {
      const existing = result.get(issue.tableDraftId) ?? [];
      existing.push(issue);
      result.set(issue.tableDraftId, existing);
    }
    return result;
  }, [serialization]);

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
    const table = createGuidedTableDraft(draft, nextTableOrdinalRef.current);
    nextTableOrdinalRef.current += 1;
    updateDraft((next) => next.tables.splice(insertAfterIndex + 1, 0, table));
    pendingFocusTableIdRef.current = table.id;
    setExpandedTableId(table.id);
    setAnnouncement("Table added. Enter a table name to continue.");
  };

  const deleteTable = (tableIndex: number) => {
    const table = draft.tables[tableIndex];
    if (!table || table.protected) return;
    const fallback = draft.tables[tableIndex - 1] ?? draft.tables[0];
    updateDraft((next) => {
      next.tables.splice(tableIndex, 1);
      for (const candidate of next.tables) {
        for (const column of candidate.columns) {
          if (column.references?.tableDraftId === table.id) column.references = null;
        }
      }
    });
    setExpandedTableId(fallback?.id ?? "");
    setAnnouncement("Table deleted.");
  };

  const addColumn = (tableIndex: number) => {
    const table = draft.tables[tableIndex];
    if (!table) return;
    updateDraft((next) => {
      const nextTable = next.tables[tableIndex]!;
      const creationOrdinal = nextColumnOrdinalByTableRef.current.get(nextTable.id)
        ?? nextOrdinal(nextTable.columns);
      nextTable.columns.push(createGuidedColumnDraft(nextTable, creationOrdinal));
      nextColumnOrdinalByTableRef.current.set(nextTable.id, creationOrdinal + 1);
    });
    setAnnouncement(`Column added to ${table.name.value || "untitled table"}.`);
  };

  useEffect(() => {
    const pendingTableId = pendingFocusTableIdRef.current;
    if (!pendingTableId || pendingTableId !== activeExpandedTableId) return;
    const input = tableNameRefs.current.get(pendingTableId);
    if (!input) return;
    pendingFocusTableIdRef.current = null;
    input.focus();
    input.scrollIntoView?.({ block: "nearest" });
  }, [activeExpandedTableId, draft.tables.length]);

  return (
    <div className={styles.editor}>
      <div className={styles.modeBar}>
        <div className={styles.modeChoice} role="radiogroup" aria-label="Authoring mode">
          <button type="button" role="radio" aria-checked={mode === "guided"} className={styles.modeButton} onClick={() => setMode("guided")}>Guided blocks</button>
          <button type="button" role="radio" aria-checked={mode === "manual"} className={styles.modeButton} onClick={() => setMode("manual")}>Manual SQL</button>
        </div>
        <span className={styles.modeHelp}>
          {mode === "guided" ? "Structured fields are parsed as PostgreSQL SQL" : "PostgreSQL SQL with live diagnostics"}
        </span>
      </div>

      {mode === "manual" ? (
        manualContent ?? <section className={styles.manualPlaceholder} aria-labelledby="manual-title">
          <h3 id="manual-title">Manual SQL</h3>
          <p>Monaco is not part of this slice. Your Guided draft remains intact when you return to Guided blocks.</p>
          <button type="button" onClick={() => setMode("guided")}>Return to Guided blocks</button>
        </section>
      ) : (
        <div className={styles.guidedLayout}>
          <div className={styles.guidedToolbar}>
            <span>{draft.tables.length} {draft.tables.length === 1 ? "table" : "tables"}</span>
            <button className={styles.addTableButton} type="button" aria-label="Add table from toolbar" onClick={() => addTable(draft.tables.length - 1)}><span aria-hidden="true">+</span> Add table</button>
          </div>
          <div className={styles.guidedScroll} data-testid="guided-scroll-region">
            <div className={styles.tableList} aria-label="Guided schema tables">
              {draft.tables.map((table, tableIndex) => {
                const label = table.name.value || "Untitled table";
                return (
                  <div className={styles.tableSequence} key={table.id}>
                    <TableBlock
                      draft={draft}
                      expanded={activeExpandedTableId === table.id}
                      issues={issuesByTable.get(table.id) ?? []}
                      table={table}
                      tableIndex={tableIndex}
                      tableNameRef={(input) => {
                        if (input) tableNameRefs.current.set(table.id, input);
                        else tableNameRefs.current.delete(table.id);
                      }}
                      onAddColumn={() => addColumn(tableIndex)}
                      onDeleteTable={() => deleteTable(tableIndex)}
                      onToggle={() => setExpandedTableId(table.id)}
                      onUpdate={(update) => updateDraft((next) => update(next.tables[tableIndex]!, next))}
                    />
                    <div className={styles.addTableRail}>
                      <button className={styles.addTableButton} type="button" aria-label={`Add table after ${label}`} onClick={() => addTable(tableIndex)}><span aria-hidden="true">+</span> Add table</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.guidedFooter}>
              <span>{draft.tables.length} {draft.tables.length === 1 ? "table" : "tables"}</span>
              <button className={styles.addTableButton} type="button" aria-label="Add table from footer" onClick={() => addTable(draft.tables.length - 1)}><span aria-hidden="true">+</span> Add table</button>
            </div>
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
  expanded,
  issues,
  table,
  tableIndex,
  tableNameRef,
  onAddColumn,
  onDeleteTable,
  onToggle,
  onUpdate,
}: {
  draft: GuidedDraftV1;
  expanded: boolean;
  issues: GuidedDraftIssue[];
  table: GuidedTableDraft;
  tableIndex: number;
  tableNameRef: (input: HTMLInputElement | null) => void;
  onAddColumn: () => void;
  onDeleteTable: () => void;
  onToggle: () => void;
  onUpdate: (update: (table: GuidedTableDraft, draft: GuidedDraftV1) => void) => void;
}) {
  const label = table.name.value || "Untitled table";
  const status = tableStatus(issues);
  const safeId = table.id.replaceAll(":", "-");
  const contentId = `guided-table-content-${safeId}`;
  const tableNameId = `guided-table-name-${safeId}`;
  const messageId = `${tableNameId}-message`;
  const tableNameIssue = issues.find((issue) => issue.columnDraftId === undefined && issue.code !== "empty-table-columns");

  return (
    <section className={styles.tableBlock} data-guided-draft-id={table.id} data-table-status={status.toLowerCase()}>
      <div className={styles.tableSummary}>
        <button
          className={styles.tableToggle}
          type="button"
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Current" : "Open"} public.${label}, ${table.columns.length} ${table.columns.length === 1 ? "column" : "columns"}, ${tableKeySummary(table)}, ${status}`}
          onClick={onToggle}
        >
          <span className={styles.disclosureIcon} aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className={styles.tableSummaryIdentity}>
            <strong title={label}>public.{label}</strong>
            <span>{table.columns.length} {table.columns.length === 1 ? "column" : "columns"}</span>
          </span>
          <span className={styles.keySummary}>{tableKeySummary(table)}</span>
          <span className={styles.tableStatus}>{status}</span>
        </button>
        {table.protected
          ? <span className={styles.protectedLabel}>Protected first table</span>
          : <button className={styles.deleteTableButton} type="button" onClick={onDeleteTable}>Delete table</button>}
      </div>

      {expanded ? (
        <div className={styles.tableContent} id={contentId}>
          <div className={styles.structuralIntro}><code aria-hidden="true">CREATE TABLE</code><span>Structural SQL is generated from these fields.</span></div>
          <div className={styles.tableNameGroup}>
            <label htmlFor={tableNameId}>Table name</label>
            <div className={styles.tableNameControl}>
              <code aria-hidden="true">public.</code>
              <input
                id={tableNameId}
                ref={tableNameRef}
                aria-describedby={messageId}
                aria-invalid={Boolean(tableNameIssue)}
                aria-label={`Table ${tableIndex + 1} name`}
                autoComplete="off"
                placeholder="e.g. orders"
                value={table.name.value}
                onChange={(event) => onUpdate((nextTable) => { nextTable.name.value = event.target.value; })}
              />
            </div>
            <p className={tableNameIssue ? styles.fieldError : styles.fieldHint} id={messageId}>
              {tableNameIssue?.message ?? "Used in generated SQL and the diagram label."}
            </p>
          </div>

          <div className={styles.columnSectionHeader}><span>Columns</span><span>Name and type remain visible at every pane width.</span></div>
          {table.columns.length === 0
            ? <p className={styles.emptyColumns}>No columns yet. Add a column to define this table.</p>
            : <div className={styles.columns}>{table.columns.map((column, columnIndex) => (
                <ColumnRow
                  key={column.id}
                  column={column}
                  columnIndex={columnIndex}
                  draft={draft}
                  onUpdate={(update) => onUpdate((nextTable, nextDraft) => update(nextTable.columns[columnIndex]!, nextDraft))}
                />
              ))}</div>}
          <div className={styles.tableFooter}>
            <code aria-hidden="true">);</code>
            <button className={styles.addColumnButton} type="button" onClick={onAddColumn}><span aria-hidden="true">+</span> Add column</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TypeCombobox({ columnIndex, value, onChange }: {
  columnIndex: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selection = parsePostgresTypeSelection(value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return GUIDED_POSTGRES_TYPE_CATALOG;
    return GUIDED_POSTGRES_TYPE_CATALOG.filter((candidate) =>
      candidate.canonicalName.includes(normalizedQuery)
      || candidate.aliases.some((alias) => alias.includes(normalizedQuery))
      || candidate.description.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  const chooseOption = (option: PostgresTypeCatalogOption) => {
    onChange(formatPostgresTypeSelection({ option, length: "", precision: "", scale: "", timePrecision: "" }));
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(filteredOptions.length - 1, 0));
    } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const updateModifier = (updates: Partial<PostgresTypeSelection>) => {
    if (selection) onChange(formatPostgresTypeSelection({ ...selection, ...updates }));
  };

  return (
    <div className={styles.typeField}>
      <label htmlFor={`${listboxId}-input`}>Type</label>
      <div className={styles.comboboxShell}>
        <input
          id={`${listboxId}-input`}
          role="combobox"
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={`Column ${columnIndex + 1} type`}
          autoComplete="off"
          placeholder="Choose type"
          value={open ? query : (selection?.option.canonicalName ?? "")}
          onBlur={() => { setOpen(false); setQuery(""); }}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => { setQuery(""); setActiveIndex(0); setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        <span className={styles.comboboxChevron} aria-hidden="true">▾</span>
        {open ? (
          <div className={styles.typeListbox} id={listboxId} role="listbox" aria-label="PostgreSQL data types">
            {filteredOptions.length === 0
              ? <p className={styles.emptyTypeResults}>No supported types match.</p>
              : filteredOptions.map((candidate, index) => (
                <div key={candidate.canonicalName} role="presentation">
                  {index === 0 || filteredOptions[index - 1]?.category !== candidate.category
                    ? <div className={styles.typeCategory}>{candidate.category}</div>
                    : null}
                  <button
                    id={`${listboxId}-option-${index}`}
                    className={styles.typeOption}
                    type="button"
                    role="option"
                    aria-selected={selection?.option.canonicalName === candidate.canonicalName}
                    data-active={index === activeIndex || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseOption(candidate)}
                  >
                    <span><strong>{candidate.canonicalName}</strong>{candidate.aliases.length > 0 ? <code>{candidate.aliases.join(", ")}</code> : null}</span>
                    <small>{candidate.description}</small>
                  </button>
                </div>
              ))}
          </div>
        ) : null}
      </div>

      {selection?.option.modifier === "length" ? <label className={styles.modifierField}><span>Length</span><input aria-label={`Column ${columnIndex + 1} type length`} inputMode="numeric" min="1" type="number" value={selection.length} onChange={(event) => updateModifier({ length: event.target.value })} /></label> : null}
      {selection?.option.modifier === "precision-scale" ? <div className={styles.modifierPair}>
        <label className={styles.modifierField}><span>Precision</span><input aria-label={`Column ${columnIndex + 1} type precision`} inputMode="numeric" min="1" type="number" value={selection.precision} onChange={(event) => updateModifier({ precision: event.target.value })} /></label>
        <label className={styles.modifierField}><span>Scale</span><input aria-label={`Column ${columnIndex + 1} type scale`} inputMode="numeric" min="0" type="number" value={selection.scale} onChange={(event) => updateModifier({ scale: event.target.value })} /></label>
      </div> : null}
      {selection?.option.modifier === "time-precision" ? <label className={styles.modifierField}><span>Time precision</span><input aria-label={`Column ${columnIndex + 1} time precision`} inputMode="numeric" max="6" min="0" type="number" value={selection.timePrecision} onChange={(event) => updateModifier({ timePrecision: event.target.value })} /></label> : null}
    </div>
  );
}

function ColumnRow({ column, columnIndex, draft, onUpdate }: {
  column: GuidedColumnDraft;
  columnIndex: number;
  draft: GuidedDraftV1;
  onUpdate: (update: (column: GuidedColumnDraft, draft: GuidedDraftV1) => void) => void;
}) {
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const reference = referenceValue(column.references);
  const defaultListId = useId();
  const defaultSuggestions = defaultSuggestionsForPostgresType(column.dataType);
  const defaultWarning = guidedDefaultCompatibilityMessage(column.dataType, column.defaultExpression);
  const activePropertyCount = [!column.nullable, column.primaryKey, column.unique, column.defaultExpression !== null, column.references !== null].filter(Boolean).length;

  return (
    <div className={styles.columnRow} data-guided-draft-id={column.id} data-properties-open={propertiesOpen || undefined} aria-label={`Column ${columnIndex + 1}`}>
      <div className={styles.columnPrimary}>
        <label className={styles.fieldGroup}><span>Name</span><input aria-label={`Column ${columnIndex + 1} name`} placeholder="e.g. user_id" value={column.name.value} onChange={(event) => onUpdate((next) => { next.name.value = event.target.value; })} /></label>
        <TypeCombobox columnIndex={columnIndex} value={column.dataType} onChange={(dataType) => onUpdate((next) => { next.dataType = dataType; })} />
      </div>
      <button className={styles.propertiesToggle} type="button" aria-expanded={propertiesOpen} onClick={() => setPropertiesOpen((current) => !current)}>
        Edit properties <span>{activePropertyCount > 0 ? `${activePropertyCount} active` : "None active"}</span>
      </button>
      <div className={styles.columnProperties}>
        {column.dataType ? (
          <label className={`${styles.fieldGroup} ${styles.defaultField}`}>
            <span>Default</span>
            <input
              aria-describedby={defaultWarning ? `${defaultListId}-warning` : undefined}
              aria-label={`Column ${columnIndex + 1} default expression`}
              list={defaultSuggestions.length > 0 ? defaultListId : undefined}
              placeholder={parsePostgresTypeSelection(column.dataType)?.option.canonicalName === "text" ? "e.g. 'pending'" : "No default"}
              value={column.defaultExpression ?? ""}
              onChange={(event) => onUpdate((next) => { next.defaultExpression = event.target.value || null; })}
            />
            {defaultSuggestions.length > 0 ? <datalist id={defaultListId}>{defaultSuggestions.map((suggestion) => <option key={suggestion.value} value={suggestion.value}>{suggestion.label}</option>)}</datalist> : null}
            <small>PostgreSQL expression. It is parsed as text and never executed.</small>
            {defaultWarning ? <small className={styles.fieldWarning} id={`${defaultListId}-warning`} role="status">{defaultWarning}</small> : null}
          </label>
        ) : null}
        <div className={styles.constraintFields} role="group" aria-label={`Column ${columnIndex + 1} constraints`}>
          <label className={styles.compactField}><input type="checkbox" checked={column.primaryKey} onChange={(event) => onUpdate((next) => { next.primaryKey = event.target.checked; })} /><span>Primary key</span></label>
          <label className={styles.compactField}><input type="checkbox" checked={!column.nullable} onChange={(event) => onUpdate((next) => { next.nullable = !event.target.checked; })} /><span>Not null</span></label>
          <label className={styles.compactField}><input type="checkbox" checked={column.unique} onChange={(event) => onUpdate((next) => { next.unique = event.target.checked; })} /><span>Unique</span></label>
        </div>
        <label className={`${styles.fieldGroup} ${styles.referenceField}`}>
          <span>Reference</span>
          <select aria-label={`Column ${columnIndex + 1} reference target`} value={reference} onChange={(event) => {
            const target = parseReferenceValue(event.target.value);
            onUpdate((next) => { next.references = target ? { ...target, onDelete: "no-action", onUpdate: "no-action" } : null; });
          }}>
            <option value="">No reference</option>
            {draft.tables.flatMap((candidateTable) => candidateTable.columns.filter((candidateColumn) => candidateColumn.id !== column.id).map((candidateColumn) => (
              <option key={candidateColumn.id} value={JSON.stringify([candidateTable.id, candidateColumn.id])}>
                {candidateTable.name.value || "Untitled table"}.{candidateColumn.name.value || "untitled_column"}
              </option>
            )))}
          </select>
        </label>
      </div>
    </div>
  );
}
