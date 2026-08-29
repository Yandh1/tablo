-- Core CREATE TABLE coverage: source order, built-in types, modifiers,
-- arrays, defaults, inline constraints, and a table-level unique constraint.
CREATE TABLE AccountProfiles (
  id bigint PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE,
  display_name varchar(80) DEFAULT 'Anonymous',
  balance numeric(12, 2) DEFAULT 0.00,
  tags text[] DEFAULT ARRAY[]::text[],
  flags boolean[] NOT NULL DEFAULT ARRAY[true],
  preferences jsonb DEFAULT '{}'::jsonb,
  avatar bytea,
  birthday date,
  last_seen timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT account_profiles_display_name_key UNIQUE (display_name)
);

CREATE TABLE audit_log (
  tenant_id uuid NOT NULL,
  sequence_no integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (tenant_id, sequence_no)
);
