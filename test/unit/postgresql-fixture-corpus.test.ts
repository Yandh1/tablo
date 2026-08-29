import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  columnId,
  namespaceId,
  normalizePostgresIdentifier,
  tableId,
  validateDiagnosticSet,
} from "@/domain/schema-ir";
import type {
  IdentifierExpectation,
  PostgresFixtureExpectationV1,
  SourceAnchorExpectation,
} from "@/test/fixtures/postgresql/fixture-contract";
import {
  postgresFixtureManifest,
  requiredPostgresFixtureFeatures,
} from "@/test/fixtures/postgresql/manifest";

const corpusRoot = fileURLToPath(
  new URL("../fixtures/postgresql/", import.meta.url),
);

interface LoadedFixture {
  source: string;
  expected: PostgresFixtureExpectationV1;
}

async function loadFixture(
  entry: (typeof postgresFixtureManifest)[number],
): Promise<LoadedFixture> {
  const [source, expectationJson] = await Promise.all([
    readFile(new URL(entry.source, `file:///${corpusRoot.replaceAll("\\", "/")}/`), "utf8"),
    readFile(
      new URL(entry.expectation, `file:///${corpusRoot.replaceAll("\\", "/")}/`),
      "utf8",
    ),
  ]);

  return {
    source,
    expected: JSON.parse(expectationJson) as PostgresFixtureExpectationV1,
  };
}

function findAnchorOffset(source: string, span: SourceAnchorExpectation): number {
  const wantedOccurrence = span.occurrence ?? 1;
  let offset = -1;

  for (let occurrence = 0; occurrence < wantedOccurrence; occurrence += 1) {
    offset = source.indexOf(span.anchor, offset + 1);
  }

  return offset;
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function sourceSpanFor(source: string, span: SourceAnchorExpectation) {
  const offset = findAnchorOffset(source, span);
  const before = source.slice(0, offset);
  const line = lineAt(source, offset);
  const lastLineBreak = before.lastIndexOf("\n");
  const column = offset - lastLineBreak;

  return {
    start: { offset, line, column },
    end: {
      offset: offset + span.anchor.length,
      line,
      column: column + span.anchor.length,
    },
  };
}

function assertIdentifier(identifier: IdentifierExpectation): void {
  const raw = identifier.quoted
    ? `"${identifier.displayName.replaceAll('"', '""')}"`
    : identifier.displayName;

  expect(normalizePostgresIdentifier(raw)).toEqual(identifier);
}

function allAnchors(
  expected: PostgresFixtureExpectationV1,
): SourceAnchorExpectation[] {
  const anchors: SourceAnchorExpectation[] = [];

  for (const namespace of expected.namespaces) {
    for (const table of namespace.tables) {
      anchors.push(table.span);
      anchors.push(...table.columns.map((column) => column.span));
      if (table.constraints.primaryKey) {
        anchors.push(table.constraints.primaryKey.span);
      }
      anchors.push(...table.constraints.unique.map((constraint) => constraint.span));
      anchors.push(...table.constraints.foreignKeys.map((constraint) => constraint.span));
    }
  }

  for (const diagnostic of expected.diagnostics) {
    anchors.push(diagnostic.span);
    anchors.push(...(diagnostic.related ?? []).map((related) => related.span));
  }

  return anchors;
}

describe("PostgreSQL parser fixture corpus contract", () => {
  it("covers every required feature and all four result outcomes", () => {
    const covered = new Set(postgresFixtureManifest.flatMap((entry) => entry.features));
    const outcomes = new Set(postgresFixtureManifest.map((entry) => entry.outcome));

    for (const feature of requiredPostgresFixtureFeatures) {
      expect(covered.has(feature), `missing fixture feature: ${feature}`).toBe(true);
    }

    expect(outcomes).toEqual(
      new Set([
        "parse-success",
        "parse-success-with-warnings",
        "syntax-error",
        "semantic-error",
      ]),
    );
  });

  it.each(postgresFixtureManifest)(
    "$slug keeps source and versioned expectations aligned",
    async (entry) => {
      const { source, expected } = await loadFixture(entry);

      expect(source.trim().length).toBeGreaterThan(0);
      expect(expected.fixtureVersion).toBe(1);
      expect(expected.outcome).toBe(entry.outcome);
      expect(new Set(expected.features)).toEqual(new Set(entry.features));

      for (const anchor of allAnchors(expected)) {
        const offset = findAnchorOffset(source, anchor);
        expect(offset, `missing anchor ${JSON.stringify(anchor.anchor)}`).toBeGreaterThanOrEqual(0);
        expect(lineAt(source, offset), `line for ${JSON.stringify(anchor.anchor)}`).toBe(
          anchor.startLine,
        );
      }
    },
  );

  it.each(postgresFixtureManifest)(
    "$slug uses PostgreSQL-normalized identities and ordered, resolvable mappings",
    async (entry) => {
      const { expected } = await loadFixture(entry);

      for (const namespace of expected.namespaces) {
        assertIdentifier(namespace.name);
        const namespaceCanonicalId = namespaceId(namespace.name.normalizedName);
        const tableNames = new Set(namespace.tables.map((table) => table.name.normalizedName));

        for (const table of namespace.tables) {
          assertIdentifier(table.name);
          const tableCanonicalId = tableId(namespaceCanonicalId, table.name.normalizedName);
          const columnNames = new Set(table.columns.map((column) => column.name.normalizedName));
          const canonicalColumnIds = new Set<string>();

          table.columns.forEach((column, index) => {
            assertIdentifier(column.name);
            expect(column.ordinal).toBe(index);
            expect(column.type.normalizedName.length).toBeGreaterThan(0);
            expect(column.type.arrayDimensions).toBeGreaterThanOrEqual(0);
            expect(column.type.modifiers.every((modifier) => modifier.normalizedValue.length > 0)).toBe(true);
            canonicalColumnIds.add(columnId(tableCanonicalId, column.name.normalizedName));
          });

          expect(canonicalColumnIds.size).toBe(table.columns.length);

          const localConstraints = [
            ...(table.constraints.primaryKey ? [table.constraints.primaryKey] : []),
            ...table.constraints.unique,
            ...table.constraints.foreignKeys,
          ];
          for (const constraint of localConstraints) {
            expect(constraint.columns.length).toBeGreaterThan(0);
            expect(constraint.columns.every((name) => columnNames.has(name))).toBe(true);
          }

          for (const foreignKey of table.constraints.foreignKeys) {
            expect(foreignKey.columns).toHaveLength(foreignKey.referencedColumns.length);
            if (foreignKey.referencedNamespace === namespace.name.normalizedName) {
              expect(tableNames.has(foreignKey.referencedTable)).toBe(true);
            }
          }
        }
      }
    },
  );

  it.each(postgresFixtureManifest)(
    "$slug diagnostics conform to the SchemaIR v1 diagnostic boundary",
    async (entry) => {
      const { source, expected } = await loadFixture(entry);
      const result = validateDiagnosticSet({
        version: 1,
        sourceRevision: 1,
        diagnostics: expected.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.messageIntent,
          range: sourceSpanFor(source, diagnostic.span),
          relatedLocations: (diagnostic.related ?? []).map((related) => ({
            message: related.messageIntent,
            range: sourceSpanFor(source, related.span),
          })),
          fix: { why: diagnostic.why, how: diagnostic.how },
        })),
      });

      expect(result).toEqual(expect.objectContaining({ success: true }));
      if (expected.outcome === "parse-success") {
        expect(expected.diagnostics).toHaveLength(0);
      } else {
        expect(expected.diagnostics.length).toBeGreaterThan(0);
      }
    },
  );
});
