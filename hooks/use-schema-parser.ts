"use client";

import { useEffect, useState } from "react";

import type {
  ParsedSchemaV1,
  ParserDiagnostic,
  SchemaParser,
} from "@/domain/parser";

export const SCHEMA_PARSER_DEBOUNCE_MS = 250;

export type SchemaParserStatus = "parsing" | "valid" | "invalid";

export interface UseSchemaParserOptions {
  source: string;
  /**
   * Injected so an in-process parser can be replaced by a worker-backed parser
   * without changing this hook or its consumers. Null represents a parser that
   * is still being initialized.
   */
  parser: SchemaParser | null;
}

export interface UseSchemaParserResult {
  status: SchemaParserStatus;
  lastValidSchema: ParsedSchemaV1 | null;
  /** Parser-neutral source ranges can be adapted directly to Monaco markers. */
  diagnostics: ParserDiagnostic[];
  /** True when the retained diagram was produced from older source text. */
  stale: boolean;
}

interface ParserSnapshot {
  settledParser: SchemaParser | null;
  settledSource: string | null;
  settledStatus: Exclude<SchemaParserStatus, "parsing"> | null;
  diagnostics: ParserDiagnostic[];
  lastValidSchema: ParsedSchemaV1 | null;
  lastValidSource: string | null;
}

const INITIAL_SNAPSHOT: ParserSnapshot = {
  settledParser: null,
  settledSource: null,
  settledStatus: null,
  diagnostics: [],
  lastValidSchema: null,
  lastValidSource: null,
};

export function useSchemaParser({
  source,
  parser,
}: UseSchemaParserOptions): UseSchemaParserResult {
  const [snapshot, setSnapshot] = useState<ParserSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    if (!parser) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      void parser.parse(source).then((result) => {
        if (!active) return;

        setSnapshot((previous) => {
          const valid = result.status === "parsed" ||
            result.status === "parsed-with-warnings";

          return {
            settledParser: parser,
            settledSource: source,
            settledStatus: valid ? "valid" : "invalid",
            diagnostics: result.diagnostics.diagnostics,
            lastValidSchema: valid ? result.schema : previous.lastValidSchema,
            lastValidSource: valid ? source : previous.lastValidSource,
          };
        });
      });
    }, SCHEMA_PARSER_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [parser, source]);

  const settledForCurrentSource =
    snapshot.settledParser === parser && snapshot.settledSource === source;

  return {
    status: settledForCurrentSource
      ? (snapshot.settledStatus ?? "parsing")
      : "parsing",
    lastValidSchema: snapshot.lastValidSchema,
    diagnostics: settledForCurrentSource ? snapshot.diagnostics : [],
    stale:
      snapshot.lastValidSchema !== null && snapshot.lastValidSource !== source,
  };
}
