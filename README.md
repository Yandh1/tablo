# Tablo

Tablo is a PostgreSQL schema design application. Next.js runs locally during
development; Docker Compose runs only the application PostgreSQL database.
User-authored schema SQL is stored as untrusted text and parsed in the browser.
It must never be executed against this application database or used as an
application migration.

## Prerequisites

- Node.js 24
- pnpm 10
- Docker Desktop or another Docker Engine with Compose v2

## Local startup

1. Create a local environment file. The checked-in values are non-secret,
   local-development defaults only:

```bash
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

2. Install dependencies, start PostgreSQL, and wait for it to report healthy:

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
docker compose ps
```

3. Apply checked-in application migrations and load the idempotent local seed:

```bash
pnpm db:migrate
pnpm db:seed
```

4. Run Next.js on the host:

```bash
pnpm dev
```

Open <http://localhost:3000>.

## Database workflow

Edit `server/db/schema.ts`, then generate and inspect a migration:

```bash
pnpm db:generate
pnpm db:check
```

Commit both the reviewed schema change and generated files under
`db/migrations/`. Apply migrations explicitly with `pnpm db:migrate`; the web
process never migrates automatically at startup. `drizzle-kit push` is not part
of the workflow.

The local seed creates one deterministic development user, one sample project,
and its default layout. Running `pnpm db:seed` repeatedly is safe. The sample
project's DDL is inserted as a parameterized text value; it is not executed.

Useful database commands:

```bash
docker compose logs postgres
docker compose stop postgres
docker compose down
```

`docker compose down` keeps the named `tablo_postgres_data` volume. To discard
all local Tablo database data, explicitly run `docker compose down --volumes`.
That operation is destructive and cannot be recovered from the volume.

Never commit `.env` or production credentials. Production must provide its own
`DATABASE_URL` and must run reviewed migrations through an explicit deployment
job.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
