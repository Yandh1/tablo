import { describe, expect, it } from "vitest";

import { createGuidedColumnDraft, createGuidedDraft, createGuidedTableDraft } from "@/domain/guided-draft";
import { projectGuidedDraftForDiagram, projectParsedSchemaForDiagram } from "@/components/workspace/schema-diagram-leaf";
import type { ParsedSchemaV1 } from "@/domain/parser";

describe("diagram projection", () => {
  it("projects GuidedDraft tables and references without creating another schema model", () => {
    const draft = createGuidedDraft("diagram-test");
    const users = draft.tables[0]!;
    users.name.value = "users";
    const userId = createGuidedColumnDraft(users, 0);
    userId.name.value = "id";
    userId.dataType = "uuid";
    userId.primaryKey = true;
    users.columns.push(userId);
    const email = createGuidedColumnDraft(users, 1);
    email.name.value = "email";
    email.dataType = "text";
    email.unique = true;
    users.columns.push(email);
    const orders = createGuidedTableDraft(draft, 1);
    orders.name.value = "orders";
    const ownerId = createGuidedColumnDraft(orders, 0);
    ownerId.name.value = "user_id";
    ownerId.dataType = "uuid";
    ownerId.primaryKey = true;
    ownerId.unique = true;
    ownerId.references = { tableDraftId: users.id, columnDraftId: userId.id, onDelete: "no-action", onUpdate: "no-action" };
    orders.columns.push(ownerId);
    draft.tables.push(orders);
    draft.tables.push(createGuidedTableDraft(draft, 2));

    const graph = projectGuidedDraftForDiagram(draft);
    expect(graph.nodes.map((node) => node.data.label)).toEqual(["users", "orders", "Untitled table"]);
    expect(graph.nodes[0]!.data.columns.map((column) => column.name)).toEqual(["id", "email"]);
    expect(graph.nodes[0]!.data.draft).toBe(false);
    expect(graph.nodes[1]!.data.columns[0]).toMatchObject({
      primaryKey: true,
      foreignKey: true,
      unique: true,
    });
    expect(graph.nodes[1]!.data.draft).toBe(false);
    expect(graph.nodes[2]!.data.draft).toBe(true);
    expect(graph.edges).toEqual([expect.objectContaining({ source: orders.id, target: users.id, label: "FK" })]);
  });

  it("projects parsed tables and foreign-key edges", () => {
    const position = { offset: 0, line: 1, column: 1 };
    const span = { start: position, end: position };
    const identifier = (displayName: string) => ({ displayName, normalizedName: displayName, quoted: false, sourceSpan: span });
    const schema: ParsedSchemaV1 = {
      version: 1,
      dialect: "postgresql",
      exportEligibility: "requires-schema-ir-validation",
      tables: [
        { id: "users", name: identifier("users"), sourceSpan: span, columns: [{ id: "users.id", name: identifier("id"), ordinal: 0, dataType: { displayName: "uuid", normalizedName: "uuid", sourceSpan: span }, nullable: false, primaryKey: true, unique: false, sourceSpan: span }] },
        { id: "orders", name: identifier("orders"), sourceSpan: span, columns: [{ id: "orders.user_id", name: identifier("user_id"), ordinal: 0, dataType: { displayName: "uuid", normalizedName: "uuid", sourceSpan: span }, nullable: false, primaryKey: false, unique: false, sourceSpan: span }] },
      ],
      relationships: [{ id: "orders-user", sourceTableId: "orders", sourceColumnId: "orders.user_id", targetTableId: "users", targetColumnId: "users.id", sourceSpan: span }],
    };

    const graph = projectParsedSchemaForDiagram(schema);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({ source: "orders", target: "users", label: "FK" });
  });
});
