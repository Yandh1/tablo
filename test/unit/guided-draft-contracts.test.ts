import { describe, expect, it } from "vitest";

import { projectGuidedDraft } from "@/domain/draft-diagram-projection";
import {
  adoptParseOutcome,
  createGuidedColumnDraft,
  createGuidedDraft,
  createGuidedTableDraft,
  reconcileGuidedDraftWithSchemaIR,
  serializeGuidedDraftToPostgresSql,
  type GuidedDraftV1,
  type LastValidSchemaStateV1,
} from "@/domain/guided-draft";

import { createValidSchemaIR, span } from "./schema-ir/fixture";

function createCompleteGuidedDraft(): GuidedDraftV1 {
  const draft = createGuidedDraft("project-contract-fixture");
  const users = draft.tables[0]!;
  users.name.value = "users";
  const userId = createGuidedColumnDraft(users, 0);
  userId.name.value = "id";
  userId.dataType = "uuid";
  userId.nullable = false;
  userId.primaryKey = true;
  const email = createGuidedColumnDraft(users, 1);
  email.name.value = "email";
  email.dataType = "text";
  email.nullable = false;
  email.unique = true;
  users.columns.push(userId, email);

  const orders = createGuidedTableDraft(draft, 1);
  orders.name.value = "orders";
  const orderId = createGuidedColumnDraft(orders, 0);
  orderId.name.value = "id";
  orderId.dataType = "uuid";
  orderId.nullable = false;
  orderId.primaryKey = true;
  const orderUserId = createGuidedColumnDraft(orders, 1);
  orderUserId.name.value = "user_id";
  orderUserId.dataType = "uuid";
  orderUserId.nullable = false;
  orderUserId.references = {
    tableDraftId: users.id,
    columnDraftId: userId.id,
    onDelete: "cascade",
    onUpdate: "no-action",
  };
  orders.columns.push(orderId, orderUserId);
  draft.tables.push(orders);
  return draft;
}

describe("guided draft contracts", () => {
  it("projects the protected first table shell while it is completely empty", () => {
    const draft = createGuidedDraft("empty-project");
    const projection = projectGuidedDraft(draft);

    expect(draft.tables[0]).toMatchObject({
      kind: "guided-table-draft",
      protected: true,
      name: { value: "" },
      columns: [],
    });
    expect(createGuidedDraft("empty-project").tables[0]!.id).toBe(
      draft.tables[0]!.id,
    );
    expect(projection).toMatchObject({
      kind: "draft-diagram-projection",
      exportEligibility: "not-exportable",
      tables: [
        {
          kind: "provisional-draft-table",
          statusLabel: "Draft",
          label: "Untitled table",
          emptyInstruction: "Add a column to define this table.",
        },
      ],
    });
    expect(serializeGuidedDraftToPostgresSql(draft)).toMatchObject({
      status: "invalid-draft",
      output: null,
      canExport: false,
    });

    draft.tables[0]!.name.value = "named_but_still_empty";
    expect(serializeGuidedDraftToPostgresSql(draft)).toMatchObject({
      status: "invalid-draft",
      issues: [{ code: "empty-table-columns" }],
    });
  });

  it("serializes the same complete draft to byte-stable PostgreSQL SQL", () => {
    const draft = createCompleteGuidedDraft();
    const first = serializeGuidedDraftToPostgresSql(draft);
    const second = serializeGuidedDraftToPostgresSql(structuredClone(draft));

    expect(first).toEqual(second);
    expect(first).toEqual({
      status: "generated",
      issues: [],
      output: {
        version: 1,
        dialect: "postgresql",
        source:
          "CREATE TABLE public.users (\n" +
          "  id uuid NOT NULL PRIMARY KEY,\n" +
          "  email text NOT NULL UNIQUE\n" +
          ");\n\n" +
          "CREATE TABLE public.orders (\n" +
          "  id uuid NOT NULL PRIMARY KEY,\n" +
          "  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE\n" +
          ");\n",
        canExport: false,
        requiresCanonicalValidation: true,
      },
    });
  });

  it("reconciles stable draft identities to validated canonical identities", () => {
    const draft = createCompleteGuidedDraft();
    const canonical = createValidSchemaIR();
    const result = reconcileGuidedDraftWithSchemaIR(draft, canonical);

    expect(result.status).toBe("reconciled");
    if (result.status === "reconciled") {
      const usersDraft = draft.tables[0]!;
      const usersCanonical = canonical.namespaces[0]!.tables[0]!;
      expect(result.identities.tables[0]).toEqual({
        draftTableId: usersDraft.id,
        canonicalTableId: usersCanonical.id,
        columns: usersDraft.columns.map((column, index) => ({
          draftColumnId: column.id,
          canonicalColumnId: usersCanonical.columns[index]!.id,
        })),
      });
      expect(result.identities.tables[0]!.draftTableId).not.toBe(
        result.identities.tables[0]!.canonicalTableId,
      );
    }
  });

  it("retains last-valid IR by identity when a newer draft is invalid", () => {
    const lastValidIr = createValidSchemaIR();
    const state: LastValidSchemaStateV1 = {
      version: 1,
      currentSourceRevision: 4,
      diagnostics: { version: 1, sourceRevision: 4, diagnostics: [] },
      parseStatus: "valid",
      showingStaleSchema: false,
      lastValid: { sourceRevision: 4, ir: lastValidIr },
    };
    const previousLastValid = state.lastValid;

    const next = adoptParseOutcome(state, {
      status: "invalid",
      sourceRevision: 5,
      diagnostics: {
        version: 1,
        sourceRevision: 5,
        diagnostics: [
          {
            code: "PGSD1001",
            severity: "error",
            message: "A table name is required.",
            range: span,
            relatedLocations: [],
            fix: {
              why: "The protected draft table is currently unnamed.",
              how: "Enter a PostgreSQL table name.",
            },
          },
        ],
      },
    });

    expect(next.lastValid).toBe(previousLastValid);
    expect(next.lastValid?.ir).toBe(lastValidIr);
    expect(next).toMatchObject({
      currentSourceRevision: 5,
      parseStatus: "invalid",
      showingStaleSchema: true,
      diagnostics: { sourceRevision: 5 },
    });
  });
});
