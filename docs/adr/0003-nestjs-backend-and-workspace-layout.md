# ADR 0003: NestJS backend and pnpm workspace layout

- Status: Accepted
- Date: 2026-09-08
- Supersedes: ADR 0001 where it keeps application code in one Next.js app and
  declines an application container

## Context

Tablo's editor, parser, and diagram currently run in one Next.js application.
The repository has a Drizzle schema, but the UI uses in-memory sample state and
there is no authentication, project API, ownership authorization, or autosave.

The backend-friendly MVP requires a separately deployable backend, strict
runtime contracts, a two-table persistence model, and two independently stored
diagram position maps. The requested repository shape also makes the frontend
and backend boundaries visible at the filesystem level.

## Options considered

1. Continue using Next.js Route Handlers and Server Actions for persistence.
2. Add a NestJS backend while leaving the Next.js application at repository
   root.
3. Move to a pnpm workspace with `frontend`, `backend`, and a vendor-neutral
   shared contracts package.
4. Split the applications into separate repositories.

For authentication, the considered choices were server sessions, access and
refresh tokens, and a short-lived stateless access token. Durable sessions and
refresh-token rotation normally require another table, which conflicts with the
approved two-table schema.

## Decision

Use option 3.

- Move the existing Next.js application into `frontend/`.
- Create a standalone NestJS HTTP application in `backend/`.
- Put Zod API contracts and vendor-neutral shared state contracts in
  `packages/contracts/`.
- Keep exactly one root `pnpm-lock.yaml` and declare all packages in
  `pnpm-workspace.yaml`.
- Store Drizzle schema, migrations, seeds, and PostgreSQL integration tests under
  `backend/`.
- Use PostgreSQL through the `pg` driver and Drizzle only. Do not introduce a
  second ORM or query builder.
- Use Passport Local for credential verification and Passport JWT for request
  authentication.
- Use a short-lived JWT in an HttpOnly cookie. Do not add session or refresh-token
  persistence in this milestone.
- Use Zod rather than class-validator/class-transformer. The NestJS best-practice
  requirement to validate all inputs is implemented through Zod schemas and a
  global/custom Zod pipe.
- Organize NestJS by feature modules with repositories behind injection tokens.
- Add a multi-stage backend Dockerfile under `dockerfiles/` and a backend service
  to Compose. PostgreSQL remains the official upstream image.
- Keep migration execution explicit and separate from normal backend startup.
- Do not require a frontend Docker image for this milestone.

Target dependency direction:

```text
packages/contracts <---- frontend
        ^
        |
      backend ----> PostgreSQL

frontend parser/diagram code never imports backend or Drizzle modules.
backend never imports React, Next.js, React Flow, Monaco, or parser vendor code.
```

## Consequences

- The repository migration is larger than adding Route Handlers, but application
  boundaries become explicit and independently deployable.
- Frontend Server Components no longer read the application database directly.
  They use a server-only NestJS API client and forward the auth cookie.
- Browser autosave calls NestJS directly with credentialed CORS.
- Shared Zod schemas prevent drift without sharing NestJS controllers, Drizzle
  row types, React Flow types, or Passport types.
- A request may perform a small user lookup during JWT validation. This is
  accepted for revocation-by-user-deletion and authentication-version checks.
- Logout clears the browser cookie but cannot revoke an already stolen access
  token before expiry. Token lifetime limits this risk.
- Adding durable refresh, multiple devices, password recovery, or server-side
  logout revocation requires revisiting the two-table constraint.
- Removing `project_layouts` and `schema_snapshots` requires a reviewed forward
  migration. Existing layout data is copied into project columns before the
  layout table is dropped; snapshot data has no MVP destination.
- Backend image builds use the repository root as Docker build context so pnpm
  workspace dependencies can be resolved.

## NestJS practice interpretation

The selected skill is framework-oriented and often demonstrates TypeORM,
class-validator, and class-transformer. Those examples are not stack mandates.
For Tablo:

- Drizzle replaces TypeORM.
- Zod replaces class-validator and class-transformer.
- Explicit response mappers plus Zod output parsing replace entity serialization.
- Drizzle transactions are used only for multi-write operations.
- Caching, queues, events, request-scoped providers, Redis, and microservice
  transports are deferred because the MVP does not need them.
- Health checks, rate limiting, structured redacted logs, graceful shutdown,
  exception filtering, feature modules, constructor injection, repository
  tokens, migrations, and Supertest E2E tests remain required.

## Reversal path

The backend exposes versioned HTTP/Zod contracts and owns persistence behind
repository interfaces. A future backend framework or database adapter can
replace NestJS or Drizzle without moving editor/parser/diagram logic. A future
session table can be introduced through a new ADR without changing project
ownership or autosave contracts.
