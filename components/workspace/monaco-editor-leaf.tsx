"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

import type { ParserDiagnostic } from "@/domain/parser";

type MonacoApi = Parameters<BeforeMount>[0];
type MonacoEditorInstance = Parameters<OnMount>[0];
type MonacoModel = ReturnType<MonacoEditorInstance["getModel"]>;

const severity: Record<ParserDiagnostic["severity"], number> = {
  error: 8,
  warning: 4,
  info: 2,
};

export function MonacoEditorLeaf({
  diagnostics,
  source,
  onSourceChange,
}: {
  diagnostics: ParserDiagnostic[];
  source: string;
  onSourceChange: (source: string) => void;
}) {
  const [theme, setTheme] = useState("tablo-light");
  const modelRef = useRef<MonacoModel>(null);
  const monacoRef = useRef<MonacoApi | null>(null);

  const applyMarkers = () => {
    const monaco = monacoRef.current;
    const model = modelRef.current;
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      "tablo-parser",
      diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        severity: severity[diagnostic.severity],
        startLineNumber: diagnostic.range.start.line,
        startColumn: diagnostic.range.start.column,
        endLineNumber: diagnostic.range.end.line,
        endColumn: Math.max(
          diagnostic.range.end.column,
          diagnostic.range.start.column + 1,
        ),
      })),
    );
  };

  useEffect(applyMarkers, [diagnostics]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(query.matches ? "tablo-dark" : "tablo-light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const beforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    monaco.editor.defineTheme("tablo-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editorLineNumber.foreground": "#8992a0",
        "editorLineNumber.activeForeground": "#374151",
        "editor.selectionBackground": "#dbeafe",
      },
    });
    monaco.editor.defineTheme("tablo-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#14181e",
        "editorLineNumber.foreground": "#8994a3",
        "editorLineNumber.activeForeground": "#f1f4f7",
        "editor.selectionBackground": "#27456f",
      },
    });
  };

  const onMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco;
    modelRef.current = _editor.getModel();
    applyMarkers();
  };

  return (
    <Editor
      beforeMount={beforeMount}
      height="100%"
      language="sql"
      onChange={(value) => onSourceChange(value ?? "")}
      onMount={onMount}
      options={{
        ariaLabel: "PostgreSQL SQL source",
        automaticLayout: true,
        folding: false,
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        scrollBeyondLastLine: false,
        stickyScroll: { enabled: false },
        tabSize: 2,
        wordWrap: "off",
      }}
      theme={theme}
      value={source}
    />
  );
}
