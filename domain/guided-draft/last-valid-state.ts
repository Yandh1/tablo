import type { DiagnosticSetV1, SchemaIRV1 } from "../schema-ir";

export interface LastValidSchemaStateV1 {
  version: 1;
  currentSourceRevision: number;
  diagnostics: DiagnosticSetV1;
  parseStatus: "valid" | "valid-with-warnings" | "invalid" | "failed";
  showingStaleSchema: boolean;
  lastValid: {
    sourceRevision: number;
    ir: SchemaIRV1;
  } | null;
}

export type ParseAdoptionOutcomeV1 =
  | {
      status: "valid";
      sourceRevision: number;
      diagnostics: DiagnosticSetV1;
      ir: SchemaIRV1;
    }
  | {
      status: "valid-with-warnings";
      sourceRevision: number;
      diagnostics: DiagnosticSetV1;
      ir: SchemaIRV1;
    }
  | {
      status: "invalid";
      sourceRevision: number;
      diagnostics: DiagnosticSetV1;
    }
  | {
      status: "failed";
      sourceRevision: number;
      diagnostics: DiagnosticSetV1;
    };

export function adoptParseOutcome(
  state: LastValidSchemaStateV1,
  outcome: ParseAdoptionOutcomeV1,
): LastValidSchemaStateV1 {
  if (outcome.sourceRevision < state.currentSourceRevision) {
    return state;
  }

  if (outcome.status === "invalid" || outcome.status === "failed") {
    return {
      ...state,
      currentSourceRevision: outcome.sourceRevision,
      diagnostics: outcome.diagnostics,
      parseStatus: outcome.status,
      showingStaleSchema: state.lastValid !== null,
      // Intentionally preserve this object and its IR by reference.
      lastValid: state.lastValid,
    };
  }

  return {
    ...state,
    currentSourceRevision: outcome.sourceRevision,
    diagnostics: outcome.diagnostics,
    parseStatus: outcome.status,
    showingStaleSchema: false,
    lastValid: {
      sourceRevision: outcome.sourceRevision,
      ir: outcome.ir,
    },
  };
}
