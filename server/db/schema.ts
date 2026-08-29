import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dialect: text("dialect").notNull().default("postgresql"),
    inputFormat: text("input_format").notNull().default("postgresql-sql"),
    sourceText: text("source_text").notNull().default(""),
    sourceRevision: bigint("source_revision", { mode: "number" })
      .notNull()
      .default(1),
    lastValidSourceHash: text("last_valid_source_hash"),
    lastValidIrVersion: integer("last_valid_ir_version"),
    lastValidIr: jsonb("last_valid_ir"),
    parseStatus: text("parse_status").notNull().default("pending"),
    diagnosticSummary: jsonb("diagnostic_summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_owner_updated_at_idx").on(
      table.ownerId,
      table.updatedAt.desc(),
    ),
    uniqueIndex("projects_owner_id_id_unique").on(table.ownerId, table.id),
    check("projects_dialect_check", sql`${table.dialect} = 'postgresql'`),
    check(
      "projects_input_format_check",
      sql`${table.inputFormat} in ('postgresql-sql', 'simple-schema')`,
    ),
    check(
      "projects_source_revision_positive_check",
      sql`${table.sourceRevision} > 0`,
    ),
    check(
      "projects_parse_status_check",
      sql`${table.parseStatus} in ('pending', 'valid', 'valid-with-warnings', 'invalid', 'worker-failure')`,
    ),
  ],
);

export const projectLayouts = pgTable(
  "project_layouts",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    layoutVersion: integer("layout_version").notNull().default(1),
    nodePositions: jsonb("node_positions").notNull().default(sql`'{}'::jsonb`),
    viewport: jsonb("viewport").notNull().default(sql`'{}'::jsonb`),
    splitRatio: numeric("split_ratio", { precision: 5, scale: 4 })
      .notNull()
      .default("0.5000"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("project_layouts_version_positive_check", sql`${table.layoutVersion} > 0`),
    check(
      "project_layouts_split_ratio_check",
      sql`${table.splitRatio} between 0.25 and 0.75`,
    ),
  ],
);

export const schemaSnapshots = pgTable(
  "schema_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    inputFormat: text("input_format").notNull(),
    sourceText: text("source_text").notNull(),
    sourceRevision: bigint("source_revision", { mode: "number" }).notNull(),
    isSourceValid: boolean("is_source_valid").notNull(),
    schemaIrVersion: integer("schema_ir_version"),
    schemaIr: jsonb("schema_ir"),
    layoutState: jsonb("layout_state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("schema_snapshots_project_sequence_unique").on(
      table.projectId,
      table.sequenceNumber,
    ),
    index("schema_snapshots_project_created_at_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
    check(
      "schema_snapshots_input_format_check",
      sql`${table.inputFormat} in ('postgresql-sql', 'simple-schema')`,
    ),
    check(
      "schema_snapshots_sequence_positive_check",
      sql`${table.sequenceNumber} > 0`,
    ),
    check(
      "schema_snapshots_source_revision_positive_check",
      sql`${table.sourceRevision} > 0`,
    ),
  ],
);
