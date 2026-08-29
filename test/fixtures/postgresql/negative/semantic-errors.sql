CREATE TABLE parents (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  CONSTRAINT parents_pkey PRIMARY KEY (tenant_id, id)
);

CREATE TABLE children (
  tenant_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  missing_parent_id uuid,
  CONSTRAINT children_parent_fkey FOREIGN KEY (tenant_id, parent_id)
    REFERENCES parents (id),
  CONSTRAINT children_missing_parent_fkey FOREIGN KEY (missing_parent_id)
    REFERENCES missing_parents (id)
);
