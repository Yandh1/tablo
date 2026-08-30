import {
  PgParser,
  type ScanToken,
} from "@supabase/pg-parser";
import type {
  ColumnDef,
  Constraint,
  CreateStmt,
  Node,
  RangeVar,
  RawStmt,
  TypeName,
} from "@supabase/pg-parser/17/types";

import type {
  AdapterColumn,
  AdapterConstraint,
  AdapterConstraintKind,
  AdapterCreateTableStatement,
  AdapterParseResult,
  AdapterRelation,
  AdapterStatement,
  AdapterToken,
  AdapterType,
  Pg17VendorAdapter,
} from "./vendor-contract";

function text(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function location(value: number | undefined): number {
  return typeof value === "number" && value >= 0 ? value : 0;
}

function nodeStrings(nodes: Node[] | undefined): string[] {
  return (nodes ?? []).flatMap((node) => {
    if (!("String" in node)) return [];
    const value = node.String.sval;
    return value ? [value] : [];
  });
}

function relation(value: RangeVar | undefined): AdapterRelation {
  return {
    catalogName: text(value?.catalogname),
    schemaName: text(value?.schemaname),
    normalizedName: value?.relname ?? "",
    locationByte: location(value?.location),
  };
}

function dataType(value: TypeName | undefined): AdapterType {
  return {
    normalizedParts: nodeStrings(value?.names),
    locationByte: location(value?.location),
    arrayDimensions: value?.arrayBounds?.length ?? 0,
  };
}

function constraintKind(value: Constraint): AdapterConstraintKind {
  switch (value.contype) {
    case "CONSTR_PRIMARY": return "primary-key";
    case "CONSTR_NOTNULL": return "not-null";
    case "CONSTR_UNIQUE": return "unique";
    case "CONSTR_FOREIGN": return "foreign-key";
    case "CONSTR_CHECK": return "check";
    case "CONSTR_IDENTITY": return "identity";
    case "CONSTR_DEFAULT": return "default";
    case "CONSTR_GENERATED": return "generated";
    default: return "other";
  }
}

function constraint(value: Constraint): AdapterConstraint {
  return {
    kind: constraintKind(value),
    name: text(value.conname),
    locationByte: location(value.location),
    localColumns: nodeStrings(value.fk_attrs ?? value.keys),
    referencedRelation: value.pktable ? relation(value.pktable) : null,
    referencedColumns: nodeStrings(value.pk_attrs),
    hasUnsupportedForeignKeyOptions:
      (value.fk_matchtype ?? "s") !== "s" ||
      (value.fk_upd_action ?? "a") !== "a" ||
      (value.fk_del_action ?? "a") !== "a" ||
      Boolean(value.deferrable || value.initdeferred),
  };
}

function nodeConstraint(node: Node): AdapterConstraint | null {
  return "Constraint" in node ? constraint(node.Constraint) : null;
}

function column(value: ColumnDef): AdapterColumn {
  return {
    normalizedName: value.colname ?? "",
    locationByte: location(value.location),
    type: dataType(value.typeName),
    constraints: (value.constraints ?? [])
      .map(nodeConstraint)
      .filter((item): item is AdapterConstraint => item !== null),
    hasUnsupportedCollation: Boolean(value.collClause),
  };
}

function createTable(
  statement: RawStmt,
  value: CreateStmt,
): AdapterCreateTableStatement {
  const columns: AdapterColumn[] = [];
  const constraints: AdapterConstraint[] = [];
  let hasUnknownElement = false;

  for (const element of value.tableElts ?? []) {
    if ("ColumnDef" in element) columns.push(column(element.ColumnDef));
    else if ("Constraint" in element) constraints.push(constraint(element.Constraint));
    else hasUnknownElement = true;
  }

  const startByte = location(statement.stmt_location);
  return {
    kind: "create-table",
    startByte,
    endByte: startByte + Math.max(0, statement.stmt_len ?? 0),
    relation: relation(value.relation),
    columns,
    constraints,
    hasUnsupportedTableFeatures:
      hasUnknownElement ||
      Boolean(
        value.inhRelations?.length ||
        value.partbound ||
        value.partspec ||
        value.ofTypename ||
        value.constraints?.length ||
        value.options?.length ||
        value.tablespacename ||
        value.accessMethod ||
        value.if_not_exists,
      ),
  };
}

function statementKind(node: Node | undefined): string {
  return node ? (Object.keys(node)[0] ?? "UnknownStmt") : "UnknownStmt";
}

function adaptStatement(statement: RawStmt): AdapterStatement {
  const startByte = location(statement.stmt_location);
  const endByte = startByte + Math.max(0, statement.stmt_len ?? 0);
  if (statement.stmt && "CreateStmt" in statement.stmt) {
    return createTable(statement, statement.stmt.CreateStmt);
  }
  return {
    kind: "unsupported",
    statementKind: statementKind(statement.stmt),
    startByte,
    endByte,
  };
}

function adaptTokens(tokens: ScanToken[] | undefined): AdapterToken[] {
  return (tokens ?? []).map((token) => ({
    kind: token.kind,
    text: token.text,
    startByte: token.start,
    endByte: token.end,
  }));
}

export async function createPg17VendorAdapter(): Promise<Pg17VendorAdapter> {
  const parser = new PgParser({ version: 17 });
  await parser.ready;

  return {
    async parse(source): Promise<AdapterParseResult> {
      const scanResult = await parser.scan(source);
      const tokens = adaptTokens(scanResult.tokens);

      if (scanResult.error) {
        return {
          status: "invalid",
          tokens,
          error: {
            kind: scanResult.error.type,
            message: scanResult.error.message,
            positionUtf16: scanResult.error.position,
          },
        };
      }

      try {
        const parseResult = await parser.parse(source);
        if (parseResult.error) {
          return {
            status: "invalid",
            tokens,
            error: {
              kind: parseResult.error.type,
              message: parseResult.error.message,
              positionUtf16: parseResult.error.position,
            },
          };
        }

        return {
          status: "parsed",
          tokens,
          statements: (parseResult.tree.stmts ?? []).map(adaptStatement),
        };
      } catch (error) {
        return {
          status: "failed",
          tokens,
          error: {
            message: error instanceof Error ? error.message : "PostgreSQL parser failed.",
            positionUtf16: 0,
          },
        };
      }
    },
  };
}
