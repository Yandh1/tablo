import { describe, expect, it } from "vitest";

import {
  formatPostgresTypeSelection,
  GUIDED_POSTGRES_TYPE_CATALOG,
  parsePostgresTypeSelection,
  resolveBuiltInPostgresType,
} from "../../domain/parser-postgresql/type-catalog";

describe("PostgreSQL type catalogue", () => {
  it("resolves parser aliases to the canonical Guided spelling", () => {
    expect(resolveBuiltInPostgresType("int8")).toBe("bigint");
    expect(resolveBuiltInPostgresType("varchar")).toBe("character varying");
    expect(resolveBuiltInPostgresType("timestamptz")).toBe("timestamp with time zone");
    expect(resolveBuiltInPostgresType("geography")).toBeNull();
  });

  it("round-trips only modifiers supported by the selected catalogue type", () => {
    const varchar = GUIDED_POSTGRES_TYPE_CATALOG.find((item) => item.canonicalName === "character varying")!;
    const numeric = GUIDED_POSTGRES_TYPE_CATALOG.find((item) => item.canonicalName === "numeric")!;
    const timestamptz = GUIDED_POSTGRES_TYPE_CATALOG.find((item) => item.canonicalName === "timestamp with time zone")!;

    expect(formatPostgresTypeSelection({ option: varchar, length: "255", precision: "", scale: "", timePrecision: "" }))
      .toBe("character varying(255)");
    expect(formatPostgresTypeSelection({ option: numeric, length: "", precision: "12", scale: "2", timePrecision: "" }))
      .toBe("numeric(12,2)");
    expect(formatPostgresTypeSelection({ option: timestamptz, length: "", precision: "", scale: "", timePrecision: "3" }))
      .toBe("timestamp(3) with time zone");

    expect(parsePostgresTypeSelection("numeric(12, 2)")).toMatchObject({ precision: "12", scale: "2" });
    expect(parsePostgresTypeSelection("timestamp(3) with time zone")).toMatchObject({ timePrecision: "3" });
    expect(parsePostgresTypeSelection("varchar(80)")).toMatchObject({
      length: "80",
      option: { canonicalName: "character varying" },
    });
  });
});
