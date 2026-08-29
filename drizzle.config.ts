import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env for local development.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
