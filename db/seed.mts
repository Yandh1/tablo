import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { projectLayouts, projects, users } from "../server/db/schema.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env for local development.",
  );
}

const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
const SAMPLE_PROJECT_ID = "00000000-0000-4000-8000-000000000101";
const SAMPLE_SOURCE = `CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE
);

CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id)
);`;

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

try {
  await db
    .insert(users)
    .values({
      id: LOCAL_USER_ID,
      email: "developer@tablo.local",
      displayName: "Local developer",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: "developer@tablo.local",
        displayName: "Local developer",
        updatedAt: new Date(),
      },
    });

  await db
    .insert(projects)
    .values({
      id: SAMPLE_PROJECT_ID,
      ownerId: LOCAL_USER_ID,
      name: "Sample commerce schema",
      sourceText: SAMPLE_SOURCE,
      parseStatus: "pending",
    })
    .onConflictDoNothing({ target: projects.id });

  await db
    .insert(projectLayouts)
    .values({ projectId: SAMPLE_PROJECT_ID })
    .onConflictDoNothing({ target: projectLayouts.projectId });

  const [seededProject] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, SAMPLE_PROJECT_ID));

  if (!seededProject) {
    throw new Error("Seed verification failed: sample project was not found.");
  }

  console.log(`Seeded local project: ${seededProject.name}`);
} finally {
  await pool.end();
}
