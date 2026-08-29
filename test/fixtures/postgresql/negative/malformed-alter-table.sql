CREATE TABLE parents (id uuid PRIMARY KEY);
CREATE TABLE children (parent_id uuid);

ALTER TABLE children
  ADD CONSTRAINT children_parent_fkey FOREIGN KEY (parent_id)
  REFERENCES parents (id ON DELETE CASCADE;
