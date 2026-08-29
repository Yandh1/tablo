import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const globalForDatabase = globalThis as typeof globalThis & {
  tabloPool?: Pool;
};

export const pool =
  globalForDatabase.tabloPool ?? new Pool({ connectionString: databaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.tabloPool = pool;
}

export const db = drizzle(pool, { schema });
