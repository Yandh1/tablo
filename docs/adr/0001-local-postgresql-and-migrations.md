# ADR 0001: Local PostgreSQL and application migrations

- Status: Accepted
- Date: 2026-08-28

## Context

Tablo needs PostgreSQL for application persistence while Next.js development
benefits from running directly on the host. Application migrations must remain
separate from user-authored schema source, which is untrusted text and must
never be executed.

## Options considered

1. Run only PostgreSQL in Docker Compose and run Next.js locally.
2. Containerize both PostgreSQL and Next.js for ordinary development.
3. Require developers to install PostgreSQL directly on the host.

For schema changes, the considered workflows were reviewed Drizzle Kit SQL
migrations, automatic schema push, and migrations run implicitly at web
startup.

## Decision

Use a PostgreSQL 17 Alpine Compose service with a named volume and a
`pg_isready` healthcheck. Run Next.js locally. Use Drizzle as a server-only data
boundary and Drizzle Kit to generate reviewed, checked-in SQL migrations.
Migrations run only through the explicit `pnpm db:migrate` command. Seed data is
idempotent and local-only.

User-authored DDL may be stored in `source_text` through parameterized queries,
but it is never passed to a SQL execution or migration API.

## Consequences

- Local setup requires Docker, but not a host PostgreSQL installation.
- Database data survives normal container recreation and `docker compose down`.
- Developers must review generated migrations and run them explicitly.
- A future deployment needs a separate migration job and real secret injection.
- The web application is not portable as a container yet; there is no current
  onboarding or deployment requirement that justifies that extra surface.

## Reversal path

The `DATABASE_URL` and repository boundary allow PostgreSQL to move to a hosted
service without changing domain code. A web container can be added as an
explicit Compose profile if a documented onboarding or deployment need appears.
Checked-in SQL migrations can be applied by a different migration runner if
Drizzle Kit no longer meets operational requirements.
