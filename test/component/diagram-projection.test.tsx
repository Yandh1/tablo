import { describe, expect, it } from "vitest";

import { createGuidedColumnDraft, createGuidedDraft, createGuidedTableDraft } from "@/domain/guided-draft";
import {
  diagramLayoutColumnCount,
  findNewTableIds,
  haveMeasuredTableNodes,
  haveRenderedTableNodes,
  layoutTableNodes,
  projectGuidedDraftForDiagram,
  projectParsedSchemaForDiagram,
  projectWorkspaceDiagram,
  reconcileTableNodes,
  sortTableNodesByRelationships,
} from "@/components/workspace/schema-diagram-leaf";
import type { ParsedSchemaV1 } from "@/domain/parser";

describe("diagram projection", () => {
  it("detects each newly added table ID once without replaying data updates", () => {
    const seenTableIds = new Set(["users"]);

    expect(findNewTableIds(seenTableIds, 1, ["users", "orders"]))
      .toEqual(["orders"]);

    seenTableIds.add("orders");
    expect(findNewTableIds(seenTableIds, 2, ["users", "orders"]))
      .toEqual([]);
    expect(findNewTableIds(seenTableIds, 2, ["canonical-users", "canonical-orders"]))
      .toEqual([]);
    expect(findNewTableIds(seenTableIds, 1, ["users", "orders"]))
      .toEqual([]);
  });

  it("waits for new tables to be measured and uses their rendered height in layout", () => {
    const draft = createGuidedDraft("measured-layout-test");
    draft.tables.push(createGuidedTableDraft(draft, 1));
    draft.tables.push(createGuidedTableDraft(draft, 2));
    const graph = projectGuidedDraftForDiagram(draft);

    expect(haveMeasuredTableNodes(graph.nodes, [graph.nodes[2]!.id])).toBe(false);

    const measured = graph.nodes.map((node, index) => ({
      ...node,
      measured: { width: 250, height: index === 0 ? 180 : 78 },
    }));
    expect(haveMeasuredTableNodes(measured, [measured[2]!.id])).toBe(true);
    expect(layoutTableNodes(measured)[2]!.position).toEqual({ x: 32, y: 252 });
  });

  it("waits for a deleted table to leave the rendered node set", () => {
    const draft = createGuidedDraft("deleted-layout-test");
    draft.tables.push(createGuidedTableDraft(draft, 1));
    const graph = projectGuidedDraftForDiagram(draft);

    expect(haveRenderedTableNodes(graph.nodes, [graph.nodes[0]!.id])).toBe(false);
    expect(haveRenderedTableNodes(graph.nodes.slice(0, 1), [graph.nodes[0]!.id]))
      .toBe(true);
  });

  it("uses more than two layout columns and keeps connected tables grouped deterministically", () => {
    const draft = createGuidedDraft("multi-column-layout-test");
    for (let index = 1; index < 10; index += 1) {
      draft.tables.push(createGuidedTableDraft(draft, index));
    }
    draft.tables.forEach((table, index) => {
      table.name.value = `table_${index}`;
      const column = createGuidedColumnDraft(table, 0);
      column.name.value = "id";
      column.dataType = "uuid";
      table.columns.push(column);
    });
    draft.tables[1]!.columns[0]!.references = {
      tableDraftId: draft.tables[0]!.id,
      columnDraftId: draft.tables[0]!.columns[0]!.id,
      onDelete: "no-action",
      onUpdate: "no-action",
    };
    draft.tables[2]!.columns[0]!.references = {
      tableDraftId: draft.tables[0]!.id,
      columnDraftId: draft.tables[0]!.columns[0]!.id,
      onDelete: "no-action",
      onUpdate: "no-action",
    };
    draft.tables[4]!.columns[0]!.references = {
      tableDraftId: draft.tables[3]!.id,
      columnDraftId: draft.tables[3]!.columns[0]!.id,
      onDelete: "no-action",
      onUpdate: "no-action",
    };

    const graph = projectGuidedDraftForDiagram(draft);
    expect(diagramLayoutColumnCount(graph.nodes.length)).toBe(4);
    expect(new Set(graph.nodes.map((node) => node.position.x)).size).toBe(4);
    expect(graph.nodes.slice(0, 5).map((node) => node.data.label)).toEqual([
      "table_0",
      "table_1",
      "table_2",
      "table_3",
      "table_4",
    ]);

    const reversedEdgeOrder = sortTableNodesByRelationships(
      graph.nodes,
      [...graph.edges].reverse(),
    );
    expect(reversedEdgeOrder.map((node) => node.id)).toEqual(
      sortTableNodesByRelationships(graph.nodes, graph.edges).map((node) => node.id),
    );
  });

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
    expect(graph.nodes[0]!.data).toMatchObject({
      draft: true,
      source: "guided-draft",
    });
    expect(graph.nodes[1]!.data.columns[0]).toMatchObject({
      primaryKey: true,
      foreignKey: true,
      unique: true,
    });
    expect(graph.nodes[1]!.data.draft).toBe(true);
    expect(graph.nodes[2]!.data.draft).toBe(true);
    expect(graph.nodes.map((node) => node.position)).toEqual([
      { x: 32, y: 32 },
      { x: 362, y: 32 },
      { x: 32, y: 168 },
    ]);
    expect(graph.edges).toEqual([expect.objectContaining({ source: orders.id, target: users.id, label: "FK" })]);

    const dragged = graph.nodes.map((node, index) => ({
      ...node,
      position: { x: 700 + index * 40, y: 420 + index * 30 },
    }));
    const renamed = projectGuidedDraftForDiagram(structuredClone(draft));
    renamed.nodes[0]!.data.label = "renamed_users";
    expect(
      reconcileTableNodes(dragged, renamed.nodes, false).map((node) => node.position),
    ).toEqual(dragged.map((node) => node.position));

    const removed = projectGuidedDraftForDiagram({
      ...draft,
      tables: draft.tables.slice(0, 2),
    });
    expect(
      reconcileTableNodes(dragged, removed.nodes, true).map((node) => node.position),
    ).toEqual([
      { x: 32, y: 32 },
      { x: 362, y: 32 },
    ]);
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
    expect(graph.nodes[0]!.data).toMatchObject({
      draft: false,
      source: "parsed-schema",
    });
    expect(graph.edges[0]).toMatchObject({ source: "orders", target: "users", label: "FK" });

    const draft = createGuidedDraft("projection-state-test");
    draft.tables[0]!.name.value = "draft_users";
    const provisional = projectWorkspaceDiagram({
      draft,
      guidedCanonical: false,
      mode: "guided",
      schema,
    });
    expect(provisional.nodes[0]!.id).toBe(draft.tables[0]!.id);
    expect(provisional.nodes[0]!.data).toMatchObject({
      draft: true,
      label: "draft_users",
      source: "guided-draft",
    });

    const canonical = projectWorkspaceDiagram({
      draft,
      guidedCanonical: true,
      mode: "guided",
      schema,
    });
    expect(canonical.nodes.map((node) => node.id)).toEqual(["users", "orders"]);
    expect(canonical.nodes.every((node) =>
      node.data.draft === false && node.data.source === "parsed-schema"
    )).toBe(true);

    const manual = projectWorkspaceDiagram({
      draft,
      guidedCanonical: false,
      mode: "manual",
      schema,
    });
    expect(manual.nodes.map((node) => node.id)).toEqual(["users", "orders"]);
  });
});
