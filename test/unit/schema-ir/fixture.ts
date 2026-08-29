import {
  SCHEMA_IR_VERSION,
  checkConstraintId,
  columnId,
  foreignKeyId,
  namespaceId,
  primaryKeyId,
  schemaId,
  tableId,
  uniqueConstraintId,
  type Identifier,
  type SchemaIRV1,
  type SourceSpan,
} from "@/domain/schema-ir";

export const span: SourceSpan = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
};

function identifier(displayName: string): Identifier {
  return {
    displayName,
    normalizedName: displayName.toLowerCase(),
    quoted: false,
    sourceSpan: span,
  };
}

export function createValidSchemaIR(): SchemaIRV1 {
  const publicId = namespaceId("public");
  const usersId = tableId(publicId, "users");
  const ordersId = tableId(publicId, "orders");
  const userId = columnId(usersId, "id");
  const emailId = columnId(usersId, "email");
  const orderId = columnId(ordersId, "id");
  const orderUserId = columnId(ordersId, "user_id");

  const textType = {
    displayName: "text",
    normalizedName: "text",
    modifiers: [],
    arrayDimensions: 0,
    sourceSpan: span,
  };

  const uuidType = {
    displayName: "uuid",
    normalizedName: "uuid",
    modifiers: [],
    arrayDimensions: 0,
    sourceSpan: span,
  };

  return {
    version: SCHEMA_IR_VERSION,
    dialect: "postgresql",
    id: schemaId(),
    source: { format: "postgresql-sql", hash: "sha256:fixture" },
    namespaces: [
      {
        id: publicId,
        name: identifier("public"),
        sourceSpan: null,
        tables: [
          {
            id: usersId,
            namespaceId: publicId,
            name: identifier("users"),
            sourceSpan: span,
            columns: [
              {
                id: userId,
                name: identifier("id"),
                ordinal: 0,
                dataType: uuidType,
                nullable: false,
                defaultExpression: null,
                sourceSpan: span,
              },
              {
                id: emailId,
                name: identifier("email"),
                ordinal: 1,
                dataType: textType,
                nullable: false,
                defaultExpression: null,
                sourceSpan: span,
              },
            ],
            constraints: {
              primaryKey: {
                kind: "primary-key",
                id: primaryKeyId({
                  tableId: usersId,
                  normalizedName: "users_pkey",
                  orderedColumnIds: [userId],
                }),
                name: identifier("users_pkey"),
                columnIds: [userId],
                sourceSpan: span,
              },
              unique: [
                {
                  kind: "unique",
                  id: uniqueConstraintId({
                    tableId: usersId,
                    normalizedName: "users_email_key",
                    orderedColumnIds: [emailId],
                  }),
                  name: identifier("users_email_key"),
                  columnIds: [emailId],
                  sourceSpan: span,
                },
              ],
              foreignKeys: [],
              checks: [
                {
                  kind: "check",
                  id: checkConstraintId({
                    tableId: usersId,
                    normalizedName: "users_email_check",
                    normalizedExpression: "email <> ''",
                  }),
                  name: identifier("users_email_check"),
                  expression: "email <> ''",
                  normalizedExpression: "email <> ''",
                  sourceSpan: span,
                },
              ],
            },
          },
          {
            id: ordersId,
            namespaceId: publicId,
            name: identifier("orders"),
            sourceSpan: span,
            columns: [
              {
                id: orderId,
                name: identifier("id"),
                ordinal: 0,
                dataType: uuidType,
                nullable: false,
                defaultExpression: null,
                sourceSpan: span,
              },
              {
                id: orderUserId,
                name: identifier("user_id"),
                ordinal: 1,
                dataType: uuidType,
                nullable: false,
                defaultExpression: null,
                sourceSpan: span,
              },
            ],
            constraints: {
              primaryKey: {
                kind: "primary-key",
                id: primaryKeyId({
                  tableId: ordersId,
                  normalizedName: null,
                  orderedColumnIds: [orderId],
                }),
                name: null,
                columnIds: [orderId],
                sourceSpan: span,
              },
              unique: [],
              foreignKeys: [
                {
                  kind: "foreign-key",
                  id: foreignKeyId({
                    tableId: ordersId,
                    normalizedName: "orders_user_id_fkey",
                    orderedColumnIds: [orderUserId],
                    referencedTableId: usersId,
                    orderedReferencedColumnIds: [userId],
                  }),
                  name: identifier("orders_user_id_fkey"),
                  columnIds: [orderUserId],
                  referencedTableId: usersId,
                  referencedColumnIds: [userId],
                  match: "simple",
                  onUpdate: "no-action",
                  onDelete: "cascade",
                  sourceSpan: span,
                },
              ],
              checks: [],
            },
          },
        ],
      },
    ],
  };
}
