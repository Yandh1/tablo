-- Tables may be separated by comments and semicolons.
CREATE TABLE "Users" (
  id uuid PRIMARY KEY,
  email character varying(120) NOT NULL UNIQUE,
  "名" text
);

/* Both supported foreign-key forms produce relationships. */
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "Users"(id),
  approver_id uuid,
  FOREIGN KEY (approver_id) REFERENCES "Users"(id)
);

