CREATE TABLE "project_layouts" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"layout_version" integer DEFAULT 1 NOT NULL,
	"node_positions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"viewport" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"split_ratio" numeric(5, 4) DEFAULT '0.5000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_layouts_version_positive_check" CHECK ("project_layouts"."layout_version" > 0),
	CONSTRAINT "project_layouts_split_ratio_check" CHECK ("project_layouts"."split_ratio" between 0.25 and 0.75)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dialect" text DEFAULT 'postgresql' NOT NULL,
	"input_format" text DEFAULT 'postgresql-sql' NOT NULL,
	"source_text" text DEFAULT '' NOT NULL,
	"source_revision" bigint DEFAULT 1 NOT NULL,
	"last_valid_source_hash" text,
	"last_valid_ir_version" integer,
	"last_valid_ir" jsonb,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"diagnostic_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_opened_at" timestamp with time zone,
	CONSTRAINT "projects_dialect_check" CHECK ("projects"."dialect" = 'postgresql'),
	CONSTRAINT "projects_input_format_check" CHECK ("projects"."input_format" in ('postgresql-sql', 'simple-schema')),
	CONSTRAINT "projects_source_revision_positive_check" CHECK ("projects"."source_revision" > 0),
	CONSTRAINT "projects_parse_status_check" CHECK ("projects"."parse_status" in ('pending', 'valid', 'valid-with-warnings', 'invalid', 'worker-failure'))
);
--> statement-breakpoint
CREATE TABLE "schema_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"sequence_number" bigint NOT NULL,
	"name" text NOT NULL,
	"input_format" text NOT NULL,
	"source_text" text NOT NULL,
	"source_revision" bigint NOT NULL,
	"is_source_valid" boolean NOT NULL,
	"schema_ir_version" integer,
	"schema_ir" jsonb,
	"layout_state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_snapshots_input_format_check" CHECK ("schema_snapshots"."input_format" in ('postgresql-sql', 'simple-schema')),
	CONSTRAINT "schema_snapshots_sequence_positive_check" CHECK ("schema_snapshots"."sequence_number" > 0),
	CONSTRAINT "schema_snapshots_source_revision_positive_check" CHECK ("schema_snapshots"."source_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_layouts" ADD CONSTRAINT "project_layouts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_updated_at_idx" ON "projects" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_id_id_unique" ON "projects" USING btree ("owner_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "schema_snapshots_project_sequence_unique" ON "schema_snapshots" USING btree ("project_id","sequence_number");--> statement-breakpoint
CREATE INDEX "schema_snapshots_project_created_at_idx" ON "schema_snapshots" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");