import { describe, expect, it } from "vitest";

import {
  columnId,
  foreignKeyId,
  namespaceId,
  primaryKeyId,
  tableId,
} from "@/domain/schema-ir";

describe("SchemaIR v1 deterministic IDs", () => {
  it("returns byte-stable IDs from canonical normalized inputs", () => {
    const namespace = namespaceId("public");
    const table = tableId(namespace, "memberships");
    const tenant = columnId(table, "tenant_id");
    const user = columnId(table, "user_id");

    expect(tableId(namespace, "memberships")).toBe(table);
    expect(columnId(table, "tenant_id")).toBe(tenant);
    expect(primaryKeyId({
      tableId: table,
      normalizedName: "memberships_pkey",
      orderedColumnIds: [tenant, user],
    })).toBe(primaryKeyId({
      tableId: table,
      normalizedName: "memberships_pkey",
      orderedColumnIds: [tenant, user],
    }));
  });

  it("treats ordered key columns and reference mappings as identity inputs", () => {
    const namespace = namespaceId("public");
    const localTable = tableId(namespace, "memberships");
    const referencedTable = tableId(namespace, "users");
    const tenant = columnId(localTable, "tenant_id");
    const user = columnId(localTable, "user_id");
    const referencedTenant = columnId(referencedTable, "tenant_id");
    const referencedUser = columnId(referencedTable, "id");

    const forward = foreignKeyId({
      tableId: localTable,
      normalizedName: null,
      orderedColumnIds: [tenant, user],
      referencedTableId: referencedTable,
      orderedReferencedColumnIds: [referencedTenant, referencedUser],
    });
    const reversed = foreignKeyId({
      tableId: localTable,
      normalizedName: null,
      orderedColumnIds: [user, tenant],
      referencedTableId: referencedTable,
      orderedReferencedColumnIds: [referencedUser, referencedTenant],
    });

    expect(reversed).not.toBe(forward);
  });

  it("length-prefixes inputs so delimiter-like names cannot collide", () => {
    const namespace = namespaceId("public");
    expect(tableId(namespace, "a|1:b")).not.toBe(tableId(namespace, "a|1:b|"));
  });
});
