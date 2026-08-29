CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  region text NOT NULL,
  CONSTRAINT tenants_region_id_key UNIQUE (region, id)
);

CREATE TABLE users (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  manager_id uuid,
  created_by_id uuid,
  updated_by_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT users_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT users_manager_fkey FOREIGN KEY (tenant_id, manager_id)
    REFERENCES users (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT users_created_by_fkey FOREIGN KEY (tenant_id, created_by_id)
    REFERENCES users (tenant_id, id) ON DELETE NO ACTION,
  CONSTRAINT users_updated_by_fkey FOREIGN KEY (tenant_id, updated_by_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE SET DEFAULT
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tenant_region text,
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (tenant_region, tenant_id) REFERENCES tenants (region, id)
    ON UPDATE SET NULL ON DELETE SET NULL
);

CREATE TABLE notes (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants (id)
);
