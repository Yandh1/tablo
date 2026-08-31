"use client";

import { Group, Panel, Separator, useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { createGuidedDraft, serializeGuidedDraftToPostgresSql, type GuidedDraftV1 } from "@/domain/guided-draft";
import type { SchemaParser } from "@/domain/parser";
import { createPostgresSchemaParser } from "@/domain/parser-postgresql";
import { useSchemaParser } from "@/hooks/use-schema-parser";

import { GuidedEditor, type AuthoringMode } from "./guided-editor";
import { ManualEditor } from "./manual-editor";
import { ProblemsPanel } from "./problems-panel";
import { SchemaDiagram } from "./schema-diagram";
import styles from "./workspace-shell.module.css";

const DEFAULT_EDITOR_RATIO = 50;
const MIN_EDITOR_RATIO = 25;
const MAX_EDITOR_RATIO = 75;
const STORAGE_KEY = "tablo.workspace.editor-ratio.v1";
const INITIAL_SQL = `CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE
);

CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id)
);
`;

type Pane = "editor" | "diagram";

function clampRatio(value: number) {
  return Math.min(MAX_EDITOR_RATIO, Math.max(MIN_EDITOR_RATIO, value));
}

export function readStoredEditorRatio(storage: Pick<Storage, "getItem">) {
  const value = Number(storage.getItem(STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_EDITOR_RATIO && value <= MAX_EDITOR_RATIO ? value : DEFAULT_EDITOR_RATIO;
}

function writeStoredEditorRatio(storage: Pick<Storage, "setItem">, ratio: number) {
  storage.setItem(STORAGE_KEY, String(clampRatio(ratio)));
}

function useDesktopWorkspace() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function WorkspacePane({ children, pane, onFullWorkspace, paneRef, canExpand = true }: { children: ReactNode; pane: Pane; onFullWorkspace: (pane: Pane, trigger: HTMLButtonElement) => void; paneRef?: Ref<HTMLDivElement>; canExpand?: boolean }) {
  const label = pane === "editor" ? "Editor" : "Diagram";
  return (
    <section ref={paneRef} className={styles.pane} aria-label={`${label} pane`} tabIndex={-1}>
      <div className={styles.paneToolbar}>
        <h2 className={styles.paneTitle}>{label}</h2>
        {canExpand ? <button className={styles.quietButton} type="button" onClick={(event) => onFullWorkspace(pane, event.currentTarget)} aria-label={`Expand ${label.toLowerCase()} pane`}>Expand</button> : null}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceShell({ projectName }: { projectName: string }) {
  const groupRef = useGroupRef();
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const diagramPaneRef = useRef<HTMLDivElement>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);
  const previousRatioRef = useRef(DEFAULT_EDITOR_RATIO);
  const [editorRatio, setEditorRatio] = useState(DEFAULT_EDITOR_RATIO);
  const [fullWorkspacePane, setFullWorkspacePane] = useState<Pane | null>(null);
  const [responsivePane, setResponsivePane] = useState<Pane>("editor");
  const [mode, setMode] = useState<AuthoringMode>("guided");
  const [draft, setDraft] = useState<GuidedDraftV1>(() => createGuidedDraft("local-schema"));
  const [source, setSource] = useState(INITIAL_SQL);
  const [parser, setParser] = useState<SchemaParser | null>(null);
  const isDesktop = useDesktopWorkspace();
  const serialization = useMemo(() => serializeGuidedDraftToPostgresSql(draft), [draft]);
  const parsedSource = mode === "manual" ? source : serialization.status === "generated" ? serialization.output.source : "";
  const parseState = useSchemaParser({ source: parsedSource, parser });
  const displayedStatus = parser === null || parseState.status === "parsing" ? "Parsing" : mode === "guided" && serialization.status !== "generated" ? "Draft incomplete" : parseState.status === "valid" ? "Valid" : "Invalid";

  useEffect(() => {
    let active = true;
    void createPostgresSchemaParser().then((nextParser) => { if (active) setParser(nextParser); });
    return () => { active = false; };
  }, []);

  const applyRatio = useCallback((nextRatio: number, persist = true) => {
    const ratio = clampRatio(nextRatio);
    setEditorRatio(ratio);
    previousRatioRef.current = ratio;
    groupRef.current?.setLayout({ editor: ratio, diagram: 100 - ratio });
    if (persist) writeStoredEditorRatio(window.localStorage, ratio);
  }, [groupRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => applyRatio(readStoredEditorRatio(window.localStorage), false), 0);
    return () => window.clearTimeout(timer);
  }, [applyRatio]);

  const exitFullWorkspace = useCallback(() => {
    if (!fullWorkspacePane) return;
    setFullWorkspacePane(null);
    setEditorRatio(previousRatioRef.current);
    window.requestAnimationFrame(() => window.setTimeout(() => focusRestoreRef.current?.focus(), 0));
  }, [fullWorkspacePane]);

  useEffect(() => {
    if (!fullWorkspacePane) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); exitFullWorkspace(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFullWorkspace, fullWorkspacePane]);

  const enterFullWorkspace = (pane: Pane, trigger: HTMLButtonElement) => {
    focusRestoreRef.current = trigger;
    previousRatioRef.current = editorRatio;
    setFullWorkspacePane(pane);
    window.requestAnimationFrame(() => (pane === "editor" ? editorPaneRef : diagramPaneRef).current?.focus());
  };

  const handleLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    if (fullWorkspacePane || !Number.isFinite(layout.editor)) return;
    const ratio = clampRatio(layout.editor);
    setEditorRatio(ratio);
    previousRatioRef.current = ratio;
    if (meta.isUserInteraction) writeStoredEditorRatio(window.localStorage, ratio);
  };

  const problems = mode === "manual" ? parseState.diagnostics : [];
  const problemStatus = mode === "guided" && serialization.status !== "generated" ? "invalid" : parseState.status;
  const editor = <GuidedEditor draft={draft} mode={mode} onDraftChange={setDraft} onModeChange={setMode} manualContent={<ManualEditor diagnostics={problems} source={source} onSourceChange={setSource} />} problemsContent={mode === "manual" ? <ProblemsPanel diagnostics={problems} status={problemStatus} /> : null} />;
  const guidedCanonical = mode === "guided"
    && serialization.status === "generated"
    && parseState.status === "valid"
    && !parseState.stale;
  const diagram = <SchemaDiagram draft={draft} guidedCanonical={guidedCanonical} mode={mode} schema={parseState.lastValidSchema} stale={parseState.stale} />;

  return (
    <div className={styles.shell}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}><span className={styles.productName}>Tablo</span><span className={styles.headerDivider} aria-hidden="true" /><h1 className={styles.projectName}>{projectName}</h1></div>
        <div className={styles.parseStatus} data-status={displayedStatus.toLowerCase().replace(" ", "-")} role="status"><span className={styles.statusDot} aria-hidden="true" />{displayedStatus}{mode === "manual" && parseState.stale ? <span className={styles.staleLabel}>Last valid diagram</span> : null}</div>
      </header>

      <div className={styles.workspaceFrame}>
        <div className={styles.workspaceControls}>
          <output className={styles.ratioOutput} aria-live="polite">Split {Math.round(editorRatio)} / {Math.round(100 - editorRatio)}</output>
          {fullWorkspacePane ? <button className={styles.exitButton} type="button" onClick={exitFullWorkspace}>Restore split <kbd>Esc</kbd></button> : null}
          {!isDesktop ? <div className={styles.tabs} role="tablist" aria-label="Workspace panes">{(["editor", "diagram"] as const).map((pane) => <button key={pane} id={`${pane}-tab`} className={styles.tab} type="button" role="tab" aria-selected={responsivePane === pane} aria-controls={`${pane}-tabpanel`} tabIndex={responsivePane === pane ? 0 : -1} onClick={() => setResponsivePane(pane)}>{pane === "editor" ? "Editor" : "Diagram"}</button>)}</div> : null}
        </div>

        {isDesktop ? (
          <Group className={styles.panelGroup} data-full-workspace={fullWorkspacePane ?? undefined} defaultLayout={{ editor: 50, diagram: 50 }} groupRef={groupRef} id="tablo-workspace" onLayoutChanged={handleLayoutChanged} orientation="horizontal" resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}>
            <Panel className={styles.editorPanel} id="editor" minSize="25%" maxSize="75%"><WorkspacePane pane="editor" paneRef={editorPaneRef} onFullWorkspace={enterFullWorkspace}>{editor}</WorkspacePane></Panel>
            <Separator id="workspace-splitter" className={styles.separator} aria-label="Resize editor and diagram panes" disableDoubleClick onDoubleClick={() => applyRatio(DEFAULT_EDITOR_RATIO)}><span className={styles.separatorGrip} aria-hidden="true" /></Separator>
            <Panel className={styles.diagramPanel} id="diagram" minSize="25%" maxSize="75%"><WorkspacePane pane="diagram" paneRef={diagramPaneRef} onFullWorkspace={enterFullWorkspace}>{diagram}</WorkspacePane></Panel>
          </Group>
        ) : (
          <div className={styles.responsivePanels}>
            <div id="editor-tabpanel" role="tabpanel" aria-labelledby="editor-tab" hidden={responsivePane !== "editor"} className={styles.responsivePanel}><WorkspacePane pane="editor" canExpand={false} onFullWorkspace={enterFullWorkspace}>{editor}</WorkspacePane></div>
            <div id="diagram-tabpanel" role="tabpanel" aria-labelledby="diagram-tab" hidden={responsivePane !== "diagram"} className={styles.responsivePanel}><WorkspacePane pane="diagram" canExpand={false} onFullWorkspace={enterFullWorkspace}>{diagram}</WorkspacePane></div>
          </div>
        )}
      </div>
    </div>
  );
}
