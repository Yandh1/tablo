CREATE TABLE supported_table (
  id uuid PRIMARY KEY
);

CREATE INDEX supported_table_id_idx ON supported_table (id);
CREATE VIEW supported_table_view AS SELECT id FROM supported_table;
GRANT SELECT ON supported_table TO reporting_role;
