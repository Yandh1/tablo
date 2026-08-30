import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ParsedSchemaV1,
  ParseSchemaResultV1,
  ParserDiagnostic,
  SchemaParser,
} from "@/domain/parser";
import {
  SCHEMA_PARSER_DEBOUNCE_MS,
  useSchemaParser,
} from "@/hooks/use-schema-parser";

const schema = (): ParsedSchemaV1 => ({
  version: 1,
  dialect: "postgresql",
  tables: [],
  relationships: [],
  exportEligibility: "requires-schema-ir-validation",
});

const diagnostic = (code: string): ParserDiagnostic => ({
  code,
  severity: "error",
  message: `Diagnostic ${code}`,
  range: {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 },
  },
  relatedLocations: [],
  fix: null,
});

const validResult = (
  parsedSchema: ParsedSchemaV1,
  diagnostics: ParserDiagnostic[] = [],
): ParseSchemaResultV1 => ({
  status: diagnostics.length > 0 ? "parsed-with-warnings" : "parsed",
  schema: parsedSchema,
  diagnostics: { version: 1, diagnostics },
});

const invalidResult = (
  diagnostics: ParserDiagnostic[],
): ParseSchemaResultV1 => ({
  status: "invalid",
  schema: null,
  diagnostics: { version: 1, diagnostics },
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSchemaParser", () => {
  it("debounces for 250 ms, then returns a valid schema and Monaco diagnostics", async () => {
    vi.useFakeTimers();
    const warning = { ...diagnostic("PGSD1108"), severity: "warning" as const };
    const parsedSchema = schema();
    const parser: SchemaParser = {
      parse: vi.fn().mockResolvedValue(validResult(parsedSchema, [warning])),
    };

    const { result } = renderHook(() =>
      useSchemaParser({ source: "CREATE TABLE users (id uuid);", parser }),
    );

    expect(result.current).toMatchObject({
      status: "parsing",
      lastValidSchema: null,
      diagnostics: [],
      stale: false,
    });

    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_PARSER_DEBOUNCE_MS - 1));
    expect(parser.parse).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(result.current).toEqual({
      status: "valid",
      lastValidSchema: parsedSchema,
      diagnostics: [warning],
      stale: false,
    });
  });

  it("retains the last valid schema and marks it stale after invalid source", async () => {
    vi.useFakeTimers();
    const parsedSchema = schema();
    const syntaxError = diagnostic("PGSD1001");
    const parser: SchemaParser = {
      parse: vi.fn()
        .mockResolvedValueOnce(validResult(parsedSchema))
        .mockResolvedValueOnce(invalidResult([syntaxError])),
    };

    const { result, rerender } = renderHook(
      ({ source }) => useSchemaParser({ source, parser }),
      { initialProps: { source: "CREATE TABLE users (id uuid);" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_PARSER_DEBOUNCE_MS));

    rerender({ source: "CREATE TABLE users (id uuid,,);" });
    expect(result.current).toEqual({
      status: "parsing",
      lastValidSchema: parsedSchema,
      diagnostics: [],
      stale: true,
    });

    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_PARSER_DEBOUNCE_MS));
    expect(result.current).toEqual({
      status: "invalid",
      lastValidSchema: parsedSchema,
      diagnostics: [syntaxError],
      stale: true,
    });
  });

  it("ignores an older asynchronous parse after a newer source becomes valid", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(result: ParseSchemaResultV1) => void> = [];
    const parser: SchemaParser = {
      parse: vi.fn(() =>
        new Promise<ParseSchemaResultV1>((resolve) => resolvers.push(resolve)),
      ),
    };

    const { result, rerender } = renderHook(
      ({ source }) => useSchemaParser({ source, parser }),
      { initialProps: { source: "first source" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_PARSER_DEBOUNCE_MS));

    rerender({ source: "second source" });
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_PARSER_DEBOUNCE_MS));

    const newerSchema = schema();
    await act(async () => resolvers[1]!(validResult(newerSchema)));
    expect(result.current.lastValidSchema).toBe(newerSchema);
    expect(result.current.stale).toBe(false);

    await act(async () => resolvers[0]!(validResult(schema())));
    expect(result.current.lastValidSchema).toBe(newerSchema);
    expect(result.current.status).toBe("valid");
  });
});
