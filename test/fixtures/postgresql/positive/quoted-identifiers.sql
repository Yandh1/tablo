CREATE TABLE "Sales"."Order Items" (
  "Order ID" uuid,
  "SKU" character varying(32) NOT NULL,
  camelCase text,
  "camelCase" text,
  CONSTRAINT "Order Items PK" PRIMARY KEY ("Order ID", "SKU")
);
