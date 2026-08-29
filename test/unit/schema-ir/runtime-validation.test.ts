import { describe, expect, it } from "vitest";

import {
  SchemaIRValidationError,
  parseSchemaIR,
  validateDiagnosticSet,
  validateSchemaIR,
} from "@/domain/schema-ir";

import { createValidSchemaIR, span } from "./fixture";

describe("SchemaIR v1 runtime validation", () => {
  it("accepts a canonical PostgreSQL graph without exposing validator errors", () => {
    const result = validateSchemaIR(createValidSchemaIR());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.namespaces[0]?.tables).toHaveLength(2);
    }
  });

  it("rejects malformed versions and unknown fields", () => {
    const malformed = { ...createValidSchemaIR(), version: 2, viewport: {} };
    const result = validateSchemaIR(malformed);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path.includes("version"))).toBe(true);
      expect(result.issues.some((issue) => issue.message.includes("Unrecognized"))).toBe(true);
    }
    expect(() => parseSchemaIR(malformed)).toThrow(SchemaIRValidationError);
  });

  it("rejects non-canonical IDs and cross-table column references", () => {
    const malformed = structuredClone(createValidSchemaIR());
    const users = malformed.namespaces[0]!.tables[0]!;
    const orders = malformed.namespaces[0]!.tables[1]!;
    users.id = "random-id";
    orders.constraints.primaryKey!.columnIds = [users.columns[0]!.id];

    const result = validateSchemaIR(malformed);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("canonical"))).toBe(true);
      expect(result.issues.some((issue) => issue.message.includes("expected table"))).toBe(true);
    }
  });

  it("validates separately revisioned diagnostic contracts", () => {
    const result = validateDiagnosticSet({
      version: 1,
      sourceRevision: 7,
      diagnostics: [
        {
          code: "PGSD1203",
          severity: "error",
          message: "Foreign key column count does not match.",
          range: span,
          relatedLocations: [{ message: "Referenced key is here.", range: span }],
          fix: {
            why: "The local and referenced key lengths differ.",
            how: "Reference the same number of columns.",
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
