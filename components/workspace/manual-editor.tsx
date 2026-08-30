"use client";

import dynamic from "next/dynamic";

import type { ParserDiagnostic } from "@/domain/parser";

import styles from "./manual-editor.module.css";

const MonacoEditorLeaf = dynamic(
  () => import("./monaco-editor-leaf").then((module) => module.MonacoEditorLeaf),
  {
    ssr: false,
    loading: () => <div className={styles.loading} role="status">Loading SQL editor...</div>,
  },
);

export function ManualEditor({
  diagnostics,
  source,
  onSourceChange,
}: {
  diagnostics: ParserDiagnostic[];
  source: string;
  onSourceChange: (source: string) => void;
}) {
  return (
    <div className={styles.manualEditor} aria-label="Manual SQL editor">
      <MonacoEditorLeaf
        diagnostics={diagnostics}
        source={source}
        onSourceChange={onSourceChange}
      />
    </div>
  );
}
