CREATE TABLE broken_orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL
  total numeric(10, 2) DEFAULT 0,
);
