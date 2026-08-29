"use client";

import {
  Group,
  Panel,
  Separator,
  useGroupRef,
  type Layout,
  type LayoutChangedMeta,
} from "react-resizable-panels";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import styles from "./workspace-shell.module.css";

const DEFAULT_EDITOR_RATIO = 50;
const MIN_EDITOR_RATIO = 25;
const MAX_EDITOR_RATIO = 75;
const STORAGE_KEY = "tablo.workspace.editor-ratio.v1";

type Pane = "editor" | "diagram";

function clampRatio(value: number) {
  return Math.min(MAX_EDITOR_RATIO, Math.max(MIN_EDITOR_RATIO, value));
}

export function readStoredEditorRatio(storage: Pick<Storage, "getItem">) {
  const value = Number(storage.getItem(STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_EDITOR_RATIO && value <= MAX_EDITOR_RATIO
    ? value
    : DEFAULT_EDITOR_RATIO;
}

function writeStoredEditorRatio(
  storage: Pick<Storage, "setItem">,
  ratio: number,
) {
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

function PlaceholderPane({ pane }: { pane: Pane }) {
  const isEditor = pane === "editor";

  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderInner}>
        <p className={styles.eyebrow}>{isEditor ? "Source" : "Canvas"}</p>
        <h3 className={styles.placeholderTitle}>
          {isEditor ? "Schema editor" : "Relational diagram"}
        </h3>
        <p className={styles.placeholderCopy}>
          {isEditor
            ? "The Monaco editor will load here in the next workspace slice."
            : "The React Flow diagram will load here in the next workspace slice."}
        </p>
      </div>
    </div>
  );
}

function WorkspacePane({
  pane,
  onFullWorkspace,
  paneRef,
}: {
  pane: Pane;
  onFullWorkspace: (pane: Pane, trigger: HTMLButtonElement) => void;
  paneRef?: Ref<HTMLDivElement>;
}) {
  const label = pane === "editor" ? "Editor" : "Diagram";

  return (
    <section
      ref={paneRef}
      className={styles.pane}
      aria-label={`${label} pane`}
      tabIndex={-1}
    >
      <div className={styles.paneToolbar}>
        <h2 className={styles.paneTitle}>{label}</h2>
        <button
          className={styles.quietButton}
          type="button"
          onClick={(event) => onFullWorkspace(pane, event.currentTarget)}
          aria-label={`Use full workspace for ${label.toLowerCase()}`}
        >
          Full workspace
        </button>
      </div>
      <PlaceholderPane pane={pane} />
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
  const isDesktop = useDesktopWorkspace();

  const applyRatio = useCallback(
    (nextRatio: number, persist = true) => {
      const ratio = clampRatio(nextRatio);
      setEditorRatio(ratio);
      previousRatioRef.current = ratio;
      groupRef.current?.setLayout({ editor: ratio, diagram: 100 - ratio });
      if (persist) writeStoredEditorRatio(window.localStorage, ratio);
    },
    [groupRef],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      applyRatio(readStoredEditorRatio(window.localStorage), false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [applyRatio]);

  const exitFullWorkspace = useCallback(() => {
    if (!fullWorkspacePane) return;
    setFullWorkspacePane(null);
    setEditorRatio(previousRatioRef.current);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => focusRestoreRef.current?.focus(), 0);
    });
  }, [fullWorkspacePane]);

  useEffect(() => {
    if (!fullWorkspacePane) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exitFullWorkspace();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFullWorkspace, fullWorkspacePane]);

  const enterFullWorkspace = (pane: Pane, trigger: HTMLButtonElement) => {
    focusRestoreRef.current = trigger;
    previousRatioRef.current = editorRatio;
    setFullWorkspacePane(pane);
    window.requestAnimationFrame(() => {
      (pane === "editor" ? editorPaneRef : diagramPaneRef).current?.focus();
    });
  };

  const handleLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    if (fullWorkspacePane || !Number.isFinite(layout.editor)) return;
    const ratio = clampRatio(layout.editor);
    setEditorRatio(ratio);
    previousRatioRef.current = ratio;
    if (meta.isUserInteraction) {
      writeStoredEditorRatio(window.localStorage, ratio);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <span className={styles.productName}>Tablo</span>
          <span className={styles.headerDivider} aria-hidden="true" />
          <h1 className={styles.projectName}>{projectName}</h1>
        </div>
        <div className={styles.projectMeta} aria-label="Project status">
          <span className={styles.formatLabel}>PostgreSQL SQL</span>
          <span className={styles.saveStatus}>Saved</span>
          <button className={styles.headerButton} type="button">Snapshot</button>
          <button className={styles.headerButton} type="button">Export</button>
        </div>
      </header>

      <div className={styles.workspaceFrame}>
        <div className={styles.workspaceControls}>
          {isDesktop ? (
            <>
              <div className={styles.presetGroup} role="group" aria-label="Workspace split presets">
                <button className={styles.presetButton} type="button" aria-pressed={editorRatio === 75 && !fullWorkspacePane} onClick={() => applyRatio(75)}>Editor focus</button>
                <button className={styles.presetButton} type="button" aria-pressed={editorRatio === 50 && !fullWorkspacePane} onClick={() => applyRatio(50)}>Balanced</button>
                <button className={styles.presetButton} type="button" aria-pressed={editorRatio === 25 && !fullWorkspacePane} onClick={() => applyRatio(25)}>Diagram focus</button>
              </div>
              <output className={styles.ratioOutput} aria-live="polite">
                Split {Math.round(editorRatio)} / {Math.round(100 - editorRatio)}
              </output>
            </>
          ) : (
            <div className={styles.tabs} role="tablist" aria-label="Workspace panes">
              {(["editor", "diagram"] as const).map((pane) => (
                <button
                  key={pane}
                  id={`${pane}-tab`}
                  className={styles.tab}
                  type="button"
                  role="tab"
                  aria-selected={responsivePane === pane}
                  aria-controls={`${pane}-tabpanel`}
                  tabIndex={responsivePane === pane ? 0 : -1}
                  onClick={() => setResponsivePane(pane)}
                >
                  {pane === "editor" ? "Editor" : "Diagram"}
                </button>
              ))}
            </div>
          )}
          {fullWorkspacePane ? (
            <button className={styles.exitButton} type="button" onClick={exitFullWorkspace}>
              Restore split <kbd>Esc</kbd>
            </button>
          ) : null}
        </div>

        {isDesktop ? (
          <Group
            className={styles.panelGroup}
            data-full-workspace={fullWorkspacePane ?? undefined}
            defaultLayout={{ editor: 50, diagram: 50 }}
            groupRef={groupRef}
            id="tablo-workspace"
            onLayoutChanged={handleLayoutChanged}
            orientation="horizontal"
            resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
          >
            <Panel
              className={styles.editorPanel}
              id="editor"
              minSize="25%"
              maxSize="75%"
            >
              <WorkspacePane pane="editor" paneRef={editorPaneRef} onFullWorkspace={enterFullWorkspace} />
            </Panel>
            <Separator
              id="workspace-splitter"
              className={styles.separator}
              aria-label="Resize editor and diagram panes"
              disableDoubleClick
              onDoubleClick={() => applyRatio(DEFAULT_EDITOR_RATIO)}
            >
              <span className={styles.separatorGrip} aria-hidden="true" />
            </Separator>
            <Panel
              className={styles.diagramPanel}
              id="diagram"
              minSize="25%"
              maxSize="75%"
            >
              <WorkspacePane pane="diagram" paneRef={diagramPaneRef} onFullWorkspace={enterFullWorkspace} />
            </Panel>
          </Group>
        ) : (
          <div className={styles.responsivePanels}>
            {(["editor", "diagram"] as const).map((pane) => (
              <div key={pane} id={`${pane}-tabpanel`} role="tabpanel" aria-labelledby={`${pane}-tab`} hidden={responsivePane !== pane} className={styles.responsivePanel}>
                <WorkspacePane pane={pane} onFullWorkspace={enterFullWorkspace} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
