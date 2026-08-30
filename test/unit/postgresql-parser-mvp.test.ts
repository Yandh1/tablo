import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { createPostgresSchemaParser } from "@/domain/parser-postgresql";
import type { SchemaParser } from "@/domain/parser";

const fixtureUrl = new URL("../fixtures/postgresql/mvp/", import.meta.url);

let parser: SchemaParser;

beforeAll(async () => {
  parser = await createPostgresSchemaParser();
});

async function fixture(name: string): Promise<string> {
  return readFile(new URL(name, fixtureUrl), "utf8");
}

function onlyDiagnosticCode(
  result: Awaited<ReturnType<SchemaParser["parse"]>>,
  code: string,
) {
  return result.diagnostics.diagnostics.find((item) => item.code === code);
}

describe("PostgreSQL MVP parser contract", () => {
  it("parses multiple commented CREATE TABLE statements into renderable tables and relationships", async () => {
    const source = await fixture("supported.sql");
    const result = await parser.parse(source);

    expect(result.status).toBe("parsed");
    expect(result.schema).not.toBeNull();
    expect(result.schema?.exportEligibility).toBe("requires-schema-ir-validation");
    expect(result.schema?.tables).toHaveLength(2);
    expect(result.schema?.relationships).toHaveLength(2);

    const [users, orders] = result.schema!.tables;
    expect(users?.name).toMatchObject({
      displayName: "Users",
      normalizedName: "Users",
      quoted: true,
    });
    expect(orders?.name).toMatchObject({
      displayName: "orders",
      normalizedName: "orders",
      quoted: false,
    });

    expect(users?.columns.map((column) => ({
      name: column.name.displayName,
      type: column.dataType.displayName,
      normalizedType: column.dataType.normalizedName,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
      unique: column.unique,
    }))).toEqual([
      {
        name: "id",
        type: "uuid",
        normalizedType: "uuid",
        nullable: false,
        primaryKey: true,
        unique: false,
      },
      {
        name: "email",
        type: "character varying(120)",
        normalizedType: "character varying",
        nullable: false,
        primaryKey: false,
        unique: true,
      },
      {
        name: "名",
        type: "text",
        normalizedType: "text",
        nullable: true,
        primaryKey: false,
        unique: false,
      },
    ]);

    expect(orders?.columns.map((column) => column.name.displayName)).toEqual([
      "id",
      "user_id",
      "approver_id",
    ]);
    expect(result.schema?.relationships.map((relationship) => relationship.sourceColumnId))
      .toEqual([orders!.columns[1]!.id, orders!.columns[2]!.id]);
  });

  it("uses exact UTF-16 spans for quoted Unicode identifiers", async () => {
    const source = await fixture("supported.sql");
    const result = await parser.parse(source);
    const unicodeName = result.schema!.tables[0]!.columns[2]!.name;

    expect(source.slice(
      unicodeName.sourceSpan.start.offset,
      unicodeName.sourceSpan.end.offset,
    )).toBe('"名"');
    expect(unicodeName.sourceSpan.start.line).toBe(5);
    expect(unicodeName.sourceSpan.start.column).toBe(3);
  });

  it("returns one precise syntax diagnostic and no adopted schema for malformed CREATE TABLE", async () => {
    const source = await fixture("malformed.sql");
    const result = await parser.parse(source);
    const diagnostic = onlyDiagnosticCode(result, "PGSD1001")!;
    const secondComma = source.indexOf(",,") + 1;

    expect(result.status).toBe("invalid");
    expect(result.schema).toBeNull();
    expect(diagnostic.range).toEqual({
      start: { offset: secondComma, line: 2, column: 14 },
      end: { offset: secondComma + 1, line: 2, column: 15 },
    });
    expect(diagnostic.fix?.why).toBeTruthy();
    expect(diagnostic.fix?.how).toBeTruthy();
  });

  it("maps malformed ranges after Unicode and CRLF into Monaco UTF-16 coordinates", async () => {
    const source = 'CREATE TABLE "名" (\r\n  id integer,,\r\n);';
    const result = await parser.parse(source);
    const diagnostic = onlyDiagnosticCode(result, "PGSD1001")!;

    expect(source.slice(
      diagnostic.range.start.offset,
      diagnostic.range.end.offset,
    )).toBe(",");
    expect(diagnostic.range.start).toMatchObject({ line: 2, column: 14 });
    expect(diagnostic.range.end).toMatchObject({ line: 2, column: 15 });
  });

  it("supports single-column table-level primary and unique constraints", async () => {
    const result = await parser.parse(`
      CREATE TABLE accounts (
        id integer,
        email text,
        PRIMARY KEY (id),
        UNIQUE (email)
      );
    `);

    expect(result.status).toBe("parsed");
    expect(result.schema?.tables[0]?.columns[0]).toMatchObject({
      primaryKey: true,
      nullable: false,
    });
    expect(result.schema?.tables[0]?.columns[1]?.unique).toBe(true);
  });

  it("rejects ALTER TABLE and composite keys rather than silently applying a partial structure", async () => {
    const alter = await parser.parse(
      "CREATE TABLE users (id integer); ALTER TABLE users ADD PRIMARY KEY (id);",
    );
    const composite = await parser.parse(
      "CREATE TABLE joins (left_id integer, right_id integer, PRIMARY KEY (left_id, right_id));",
    );

    expect(alter).toMatchObject({ status: "invalid", schema: null });
    expect(onlyDiagnosticCode(alter, "PGSD1102")).toBeDefined();
    expect(composite).toMatchObject({ status: "invalid", schema: null });
    expect(onlyDiagnosticCode(composite, "PGSD1103")).toBeDefined();
  });

  it("projects safe deferred constructs with explicit warnings", async () => {
    const result = await parser.parse(`
      CREATE TABLE items (
        id integer GENERATED ALWAYS AS IDENTITY,
        labels text[],
        code text DEFAULT 'pending',
        CONSTRAINT items_code_unique UNIQUE (code),
        CHECK (char_length(code) > 0)
      );
    `);

    expect(result.status).toBe("parsed-with-warnings");
    expect(result.schema?.tables[0]?.columns[1]?.dataType.displayName).toBe("text[]");
    expect(result.diagnostics.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "PGSD1104",
        "PGSD1105",
        "PGSD1106",
        "PGSD1108",
        "PGSD1111",
      ]),
    );
  });

  it("rejects non-public schemas and preserves public qualification", async () => {
    const publicResult = await parser.parse("CREATE TABLE public.users (id uuid PRIMARY KEY);");
    const otherResult = await parser.parse("CREATE TABLE auth.users (id uuid PRIMARY KEY);");

    expect(publicResult.status).toBe("parsed");
    expect(publicResult.schema?.tables[0]?.name.normalizedName).toBe("users");
    expect(otherResult).toMatchObject({ status: "invalid", schema: null });
    expect(onlyDiagnosticCode(otherResult, "PGSD1107")).toBeDefined();
  });

  it("resolves quoted references with PostgreSQL identifier normalization", async () => {
    const result = await parser.parse(`
      CREATE TABLE "Parent" ("ID" uuid PRIMARY KEY);
      CREATE TABLE child (parent_id uuid REFERENCES "Parent"("ID"));
    `);

    expect(result.status).toBe("parsed");
    expect(result.schema?.relationships).toHaveLength(1);
    expect(result.schema?.relationships[0]?.targetTableId)
      .toBe(result.schema?.tables[0]?.id);
    expect(result.schema?.relationships[0]?.targetColumnId)
      .toBe(result.schema?.tables[0]?.columns[0]?.id);
  });

  it("does not claim semantic type compatibility for mismatched foreign keys", async () => {
    const result = await parser.parse(`
      CREATE TABLE parents (id uuid PRIMARY KEY);
      CREATE TABLE children (parent_id integer REFERENCES parents(id));
    `);

    expect(result.status).toBe("parsed-with-warnings");
    const warning = onlyDiagnosticCode(result, "PGSD1109");
    expect(warning?.relatedLocations).toHaveLength(2);
    expect(result.schema?.relationships).toHaveLength(1);
  });

});
