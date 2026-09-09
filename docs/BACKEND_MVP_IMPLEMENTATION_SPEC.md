# Backend-friendly MVP implementation specification

## Purpose

This is the execution contract for an LLM implementing Tablo's backend-friendly
MVP. It is intentionally specific enough to generate the repository migration,
backend, frontend integration, database migration, Docker image, and tests
without inventing product behavior.

Do not treat this document as evidence that the implementation already exists.
Before implementing, inspect the current worktree and preserve unrelated user
changes.

## Required reading before implementation

1. `AGENTS.md`
2. `.codex/PRODUCT.md`
3. `docs/UX_CONVENTIONS.md`
4. `docs/adr/0001-local-postgresql-and-migrations.md`
5. `docs/adr/0002-postgresql-ddl-parser.md`
6. `docs/adr/0003-nestjs-backend-and-workspace-layout.md`
7. `.agents/skills/nestjs-best-practices/SKILL.md` and the relevant rule files
8. Root and package `package.json` files, `pnpm-lock.yaml`, and
   `pnpm-workspace.yaml`
9. The installed Next.js 16 guides relevant to every frontend route, cookie,
   server/client, and build change

## Fixed technology decisions

The backend must use:

- NestJS with the Express HTTP adapter
- TypeScript with strict compiler settings
- Zod for request, response, environment, JSONB, and shared contract validation
- Drizzle ORM and Drizzle Kit
- PostgreSQL 17 through the `pg` driver
- Passport through `@nestjs/passport`
- Passport Local for email/password login
- Passport JWT for authenticated requests
- Argon2id for password hashing
- pnpm 10 and the repository's pinned Node 24 runtime
- Vitest for unit/contract/integration tests and Supertest for NestJS HTTP E2E;
  do not add Jest solely because it is the NestJS scaffold default

Do not add TypeORM, Prisma, Sequelize, Knex, class-validator,
class-transformer-based validation, NextAuth/Auth.js, Lucia, or a second API
framework.

Supporting NestJS packages for configuration, JWT signing, throttling, testing,
cookies, and security headers are allowed when their use is documented and
tested. Prefer the smallest dependency set. Use Nest's built-in logger in JSON
mode unless a measured need justifies another logging library.

`pgsql` in the product request means PostgreSQL backed by the established `pg`
Node driver; it does not mean adding an unrelated package named `pgsql`.

## Target repository layout

The implementation must end with this high-level shape:

```text
tablo/
├── backend/
│   ├── src/
│   ├── db/
│   │   ├── migrations/
│   │   └── seed.mts
│   ├── test/
│   ├── drizzle.config.ts
│   ├── nest-cli.json
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.build.json
├── frontend/
│   ├── app/
│   ├── components/
│   ├── domain/
│   ├── hooks/
│   ├── public/
│   ├── test/
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
├── packages/
│   └── contracts/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── dockerfiles/
│   └── backend.Dockerfile
├── docs/
├── .env.example
├── .dockerignore
├── compose.yaml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Rules for the move:

- Move existing Next.js application code and its tests into `frontend/` without
  changing product behavior merely to accommodate the move.
- Keep one root lockfile. Do not create lockfiles in packages.
- The root `package.json` contains workspace orchestration scripts, not the
  complete dependency list for both applications.
- Put each runtime dependency in the package that imports it.
- `packages/contracts` may depend on Zod but not on NestJS, Next.js, React,
  React Flow, Passport, Drizzle, `pg`, or a PostgreSQL parser vendor.
- Backend code must not import frontend files.
- Frontend code must not import backend files or database modules.
- Keep parser, SchemaIR conversion, guided-draft behavior, and diagram projection
  on the frontend/shared-domain side. The backend stores validated documents but
  never parses schema source on each keystroke.

## Dependency and module boundaries

```text
                         packages/contracts
                          /              \
                         v                v
frontend Next.js + browser state      backend NestJS
           |                              |
           v                              v
parser / SchemaIR / React Flow       repositories / Drizzle
                                           |
                                           v
                                      PostgreSQL 17
```

NestJS must be organized by feature rather than by global technical folders:

```text
backend/src/
├── app.module.ts
├── main.ts
├── config/
├── common/
│   ├── errors/
│   ├── filters/
│   ├── logging/
│   └── validation/
├── database/
│   ├── database.module.ts
│   ├── database.service.ts
│   └── schema.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── guards/
│   ├── passport/
│   └── decorators/
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   └── users.repository.drizzle.ts
├── projects/
│   ├── projects.controller.ts
│   ├── projects.module.ts
│   ├── projects.service.ts
│   ├── projects.repository.ts
│   ├── projects.repository.drizzle.ts
│   └── guards/
└── health/
```

Module rules:

- Keep services stateless singletons with constructor injection.
- Use symbol injection tokens for repository interfaces.
- Export providers only from their owning module.
- `AuthModule` may import `UsersModule`; `UsersModule` must not import
  `AuthModule`.
- `ProjectsModule` depends on authentication through a guard/principal contract,
  not by importing Auth service business logic.
- Do not use `forwardRef`. Resolve any circular dependency by changing module
  ownership.
- Do not introduce request-scoped services for the MVP.
- Do not use a service locator or access the Nest application container from
  domain/services.

## PostgreSQL schema

After the forward migration, exactly two application tables may exist.

### `users`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key, generated |
| `email` | text | original normalized-for-display value, not null |
| `email_normalized` | text | trimmed lowercase comparison value, unique, not null |
| `password_hash` | text | Argon2id encoded hash, not null, never selected for public responses |
| `display_name` | text | nullable, trimmed, bounded length |
| `auth_version` | integer | not null, default 1, positive |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |

The login repository may select `password_hash`; normal user response queries
must not. JWT validation selects only `id`, `email`, `display_name`, and
`auth_version`.

### `projects`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key, generated |
| `owner_id` | uuid | not null, FK to users with cascade delete |
| `name` | text | not null, trimmed, 1-120 characters |
| `authoring_mode` | text | `guided` or `manual` |
| `source_text` | text | latest source, including invalid source, not null |
| `guided_draft` | jsonb | nullable, versioned GuidedDraft for incomplete Guided work |
| `revision` | integer | not null, default 1, positive, optimistic concurrency token |
| `parse_status` | text | pending, valid, valid-with-warnings, invalid, or failed |
| `last_valid_source_hash` | text | nullable |
| `last_valid_ir_version` | integer | nullable |
| `last_valid_ir` | jsonb | nullable, runtime-validated canonical SchemaIR only |
| `default_diagram_positions` | jsonb | non-null DiagramPositionsV1 |
| `custom_diagram_positions` | jsonb | nullable DiagramPositionsV1 |
| `preferred_diagram_view` | text | `default` or `custom` |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |
| `last_opened_at` | timestamptz | nullable |

Required indexes and constraints:

- Unique index on `users.email_normalized`.
- Index on `projects.owner_id, projects.updated_at DESC` for project listing.
- Check constraints for positive revisions/auth versions and enum-like text
  columns.
- Check that last-valid hash, version, and IR are either all null or all present.
- Check that custom view cannot be preferred while custom positions are null.
- JSONB shape remains runtime-validated with Zod even when basic database JSON
  type checks are present.

There are no `project_layouts`, `schema_snapshots`, `sessions`,
`refresh_tokens`, `memberships`, or `roles` tables.

### Migration policy

- Do not rewrite an already applied migration.
- Generate and review a forward Drizzle migration.
- Add the new project columns first.
- Backfill `default_diagram_positions` from existing
  `project_layouts.node_positions` when present.
- Leave `custom_diagram_positions` null unless data proves a layout was manually
  edited; do not guess.
- Drop `schema_snapshots` and `project_layouts` only after the backfill step.
- Snapshot data has no destination in this MVP. Surface this destructive aspect
  before applying the migration anywhere except disposable local/test databases.
- Migrations run through an explicit command or deployment job, never normal
  NestJS startup.
- Update the idempotent seed for the two-table schema without executing stored
  schema source.

## Shared Zod contracts

All schemas must be strict: unknown keys fail validation rather than being
silently stripped. Export inferred TypeScript types from the schemas; do not
hand-maintain duplicate interfaces.

Required contract groups:

- Environment configuration
- UUID route parameters
- Pagination query
- Register, login, current-user, and logout responses
- Project create, summary, detail, rename, delete, and autosave
- GuidedDraft JSONB
- SchemaIR JSONB
- DiagramPositionsV1 JSONB
- API error response

### DiagramPositionsV1

The contract is vendor-neutral:

```json
{
  "version": 1,
  "positions": {
    "stable-diagram-node-id": { "x": 120, "y": 240 }
  }
}
```

Validation requirements:

- At most 500 position entries for the MVP.
- Keys are non-empty stable IDs with a conservative maximum length.
- `x` and `y` are finite numbers within documented canvas bounds.
- No `NaN`, infinities, dimensions, selection flags, handles, React Flow node
  objects, or arbitrary metadata.
- The empty default document is `{ version: 1, positions: {} }`.

### API response validation

Controllers return explicit response objects parsed through public Zod schemas.
Never return Drizzle rows. This is especially important for users because a
database row may include `password_hash`.

Validation errors expose field paths and safe messages, never raw password,
token, cookie, source, IR, or layout values.

## Authentication design

### Registration

- Accept email, password, and optional display name.
- Normalize email by trimming and lowercasing into `email_normalized`.
- Enforce a reasonable maximum password byte length to prevent hashing DoS.
- Use an MVP password minimum of 12 characters; do not require arbitrary symbol
  composition rules.
- Hash with Argon2id using reviewed parameters appropriate to the deployment.
- Handle the unique-email race through the database constraint, not only a
  preflight query.
- Map duplicate email to `409 EMAIL_ALREADY_REGISTERED`.
- Return the public user and establish authentication cookie, or explicitly keep
  registration and login separate. Choose one behavior and test it consistently;
  the preferred MVP behavior is register-and-sign-in.

### Login

- Passport Local calls one repository method that loads the authentication row
  by normalized email.
- Password mismatch and unknown email return the same `401 INVALID_CREDENTIALS`.
- Do not reveal account existence through timing or error text.
- Sign a short-lived JWT after successful verification.

### JWT and cookie

- JWT payload: `sub`, `ver`, `iat`, `exp`, `iss`, and `aud` only.
- Use an environment secret of at least 32 random bytes; fail startup if invalid.
- Default access-token lifetime: 30 minutes, configurable within a documented
  bounded range.
- Cookie name: `tablo_access`.
- Cookie flags: HttpOnly, SameSite=Lax, Secure in production, Path=/, and
  Max-Age no longer than token expiry.
- Configure an optional shared cookie domain for deployments that serve frontend
  and API from sibling subdomains. Do not set a Domain attribute in localhost
  development.
- Browser API requests use `credentials: include`.
- CORS allows only the configured frontend origin and allows credentials.
- Unsafe methods require a matching allowed `Origin` header. SameSite cookies
  and CORS alone are not treated as the complete CSRF boundary.
- Prefer one public production origin with infrastructure routing `/api` to the
  NestJS service. This keeps a host-only cookie available to both browser and
  frontend server rendering without a broad parent-domain cookie. Exact-origin
  CORS is primarily for the two-port local development setup.
- If sibling production subdomains are chosen instead, require an explicit
  reviewed cookie-domain setting. A genuinely cross-site deployment requires a
  different SameSite and CSRF-token design and is outside this MVP.

Passport JWT validation must load the user by `sub`, reject missing users, and
compare JWT `ver` to `users.auth_version`.

### Logout limitation

Logout clears the cookie with the exact same cookie attributes. There is no
server-side token record, so it cannot revoke a copied token before expiry. Do
not claim otherwise in UI or documentation.

## API contract

Use NestJS URI versioning plus the global `api` prefix. Public paths therefore
start with `/api/v1`.

### Public routes

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create user, set cookie, return public user |
| POST | `/api/v1/auth/login` | Passport Local login, set cookie |
| POST | `/api/v1/auth/logout` | Clear cookie; idempotent |
| GET | `/api/v1/health/live` | Process liveness, no database dependency |
| GET | `/api/v1/health/ready` | Database readiness using a bounded `SELECT 1` |

Apply strict rate limits to register and login. Health endpoints are not included
in the normal API throttle budget.

### Authenticated routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/auth/me` | Return current public user |
| GET | `/api/v1/projects` | Paginated owned project summaries |
| POST | `/api/v1/projects` | Create an owned project |
| GET | `/api/v1/projects/:projectId` | Return owned project document |
| PATCH | `/api/v1/projects/:projectId` | Rename project using base revision |
| PATCH | `/api/v1/projects/:projectId/autosave` | Atomic document/layout autosave |
| DELETE | `/api/v1/projects/:projectId` | Delete owned project |

The server never accepts `ownerId` in a public request.

### Autosave request

The strict autosave body contains:

- `baseRevision`
- `authoringMode`
- `sourceText`
- `guidedDraft`, nullable
- `parseState`, a discriminated union
- `defaultDiagramPositions`
- `customDiagramPositions`, nullable
- `preferredDiagramView`

Parse-state behavior:

- `valid` and `valid-with-warnings` must include a source hash and runtime-valid
  SchemaIR. The backend adopts those last-valid fields.
- For valid adoption, the backend computes SHA-256 over the submitted source
  text and requires both the submitted source hash and `SchemaIR.source.hash` to
  equal that computed value.
- `invalid`, `failed`, and `pending` must not replace last-valid fields.
- The source is always persisted, including invalid source.
- The backend validates source size, guided draft size/shape, SchemaIR shape, and
  both layouts before opening a database transaction/update.

The response returns the complete persisted project document and incremented
revision through its public response schema.

### Error shape

All errors use one stable shape:

```json
{
  "error": {
    "code": "PROJECT_REVISION_CONFLICT",
    "message": "The project changed after this edit was based on it.",
    "requestId": "...",
    "details": {}
  }
}
```

Expected status mapping:

- 400: invalid parameters/body/content type
- 401: missing, expired, or invalid authentication
- 404: missing or non-owned project
- 409: duplicate email or revision conflict
- 413: request/source/document too large
- 429: rate limited
- 500: safe generic internal error
- 503: readiness/database unavailable

The global exception filter maps known domain/database errors and hides internal
exceptions. It must not parse database error-message strings when PostgreSQL
error codes or typed domain errors are available.

## Ownership implementation

Ownership is defense in depth:

1. A global Passport JWT guard authenticates every route unless it is explicitly
   marked public.
2. Project parameter routes use an ownership guard or equivalent pre-handler
   that verifies the `(projectId, userId)` pair.
3. Every project repository read/update/delete still includes both `id` and
   `owner_id` predicates.
4. Update/delete success is determined from `RETURNING`, never from a prior
   unscoped read.
5. Services accept `ownerId` from the authenticated principal as a required
   argument; they never read an owner from request input.

Do not return 403 for an existing project owned by somebody else. Return the
same 404 as a missing project.

## Autosave implementation behavior

### Backend

- Use a single conditional Drizzle update for ordinary autosave:
  `(id, owner_id, revision = baseRevision)` and `revision = revision + 1`.
- Adopt valid last-valid state in the same atomic update as source and layouts.
- Preserve stored last-valid fields for invalid/failed/pending input.
- Use a transaction only if implementation requires more than one database
  statement whose effects must be atomic.
- Bound statement time and request body size.
- Return only the new document response, never internal database metadata.

### Frontend autosave state machine

Required states:

```text
Clean -> Dirty -> Saving -> Saved -> Clean
                  |  \
                  |   -> Conflict
                  -> Failed
```

- Parsing and saving are separate state machines.
- Debounce ordinary source/form changes by 600-1000 ms.
- Diagram drag does not update React/network state on every pointer move; capture
  the position on drag end and schedule autosave.
- Keep exactly one request in flight per project.
- While a request is in flight, replace the pending snapshot with the newest
  state rather than queueing every intermediate edit.
- After success, use the returned revision and immediately send any newer pending
  snapshot.
- On transient failure, retain dirty state and expose Retry.
- On 401, preserve local state and route to sign-in with a safe return path.
- On 409, stop automatic writes and show a persistent conflict state. Offer to
  reload the server version or explicitly overwrite only through a separately
  designed, confirmed action. Do not silently last-write-wins.
- Ignore responses belonging to a previous project ID or superseded client
  generation.

## Frontend integration

### Routes

- `/login` and `/register` are public auth forms.
- `/projects` lists only the authenticated user's projects and supports create,
  rename, open, and confirmed delete.
- `/projects/[projectId]` loads the real project document into the existing
  workspace.
- Add meaningful `loading.tsx`, `error.tsx`, and `not-found.tsx` boundaries.
- Preserve the full-height workspace route group separately from auth/list pages.

### API clients

- Create one server-only API client for Server Components and one browser client
  for interactive/autosave requests.
- Both clients use shared request/response Zod schemas.
- Server calls forward the incoming auth cookie but never log it.
- Browser calls include credentials and normalize the documented API error shape.
- No frontend Route Handler or Server Action may bypass NestJS and access
  PostgreSQL directly.
- Do not expose the internal Docker hostname as the browser API URL.

### Workspace hydration

Replace hard-coded project name, sample SQL, and local-only project state with
the loaded project response. Hydration must preserve:

- current source
- current Guided draft when in Guided mode
- authoring mode
- last-valid canonical schema
- source/project revision
- parse status
- default positions
- custom positions
- preferred diagram view

The splitter ratio may remain a device-local preference for this MVP; it is not
one of the two project diagram position maps.

### Layout toggle and handler

Add a keyboard-operable two-option control near diagram controls:

- `Default layout`
- `Edited layout`

Behavior:

- The active option is conveyed through text and `aria-pressed`/radio semantics,
  not color alone.
- Default mode renders `defaultDiagramPositions` and prevents node dragging.
- Edited mode renders `customDiagramPositions`; if null, clone the current
  default positions before entering it.
- `onNodeDragStop` updates custom positions only.
- Default positions are produced by the existing/default layout engine after a
  topology change, not by the backend.
- When topology adds nodes, recompute the default map, retain every surviving
  custom entry, and add missing custom entries from the new default map.
- When topology removes nodes, remove stale entries from both maps.
- Name/column edits that do not change topology do not re-layout either map.
- A `Reset edited layout` action is available only in Edited mode and requires
  confirmation because it overwrites user positioning.
- Switching layouts preserves selection when the selected node still exists and
  uses the React Flow viewport API for any requested fit.
- React Flow remains a frontend-only dependency. Shared contracts use plain
  coordinates.

## Security requirements

- Configure Helmet appropriate to a JSON API.
- Configure exact-origin credentialed CORS; never use origin `*` with cookies.
- Reject unsupported content types for JSON endpoints.
- Set global and endpoint-specific body-size limits.
- Use parameterized Drizzle queries only.
- Store schema source as text. Never send it to `db.execute`, `sql.raw`, a
  migration runner, or a PostgreSQL connection as executable SQL.
- Do not reflect untrusted source, emails, identifiers, or database messages into
  error strings.
- Do not log request bodies on auth/autosave routes.
- Redact Cookie, Authorization, password, token, source, IR, guided draft, and
  layouts from all structured logs.
- Generate or forward a request ID and include it in logs and error responses.
- Apply secure production cookie flags and reject missing production secrets.
- Use a dedicated non-superuser PostgreSQL role for the application when
  production deployment is configured.

## Configuration

Use `@nestjs/config`, but parse the complete environment once through a strict
Zod schema at startup. Feature code receives typed namespaced configuration by
constructor injection; it does not scatter `process.env` access.

Document at least:

- `NODE_ENV`
- `BACKEND_PORT`
- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `JWT_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_TTL_SECONDS`
- `AUTH_COOKIE_NAME`
- `AUTH_COOKIE_DOMAIN` as optional
- `TRUST_PROXY`
- request/source/body limits
- PostgreSQL pool limits and timeouts

Default limits unless implementation evidence requires a documented change:

- project name: 1-120 Unicode characters after trimming
- display name: at most 80 Unicode characters after trimming
- email: at most 254 characters before normalization
- password: 12-128 UTF-8 bytes
- schema source: at most 512 KiB UTF-8
- complete JSON request body: at most 2 MiB
- diagram positions: at most 500 entries per map

`.env.example` contains local non-secret defaults or obvious placeholders. Never
commit a real secret.

## Logging, lifecycle, and health

- Use structured JSON logging in production and readable Nest logging in local
  development.
- Include request ID, method, route template, status, duration, and authenticated
  user ID when available.
- Never include sensitive payloads listed above.
- Enable Nest shutdown hooks.
- Close the `pg` pool during module/application shutdown.
- Liveness reports whether the process/event loop can respond; it does not query
  PostgreSQL.
- Readiness performs a bounded PostgreSQL `SELECT 1` through the database service.
- During shutdown, readiness becomes unavailable before the pool closes.

## Docker and Compose

### Backend image

`dockerfiles/backend.Dockerfile` is required.

- Use a pinned Node 24 Debian slim image unless native dependency evidence
  supports another base.
- Use a multi-stage build.
- Use Corepack/pinned pnpm consistent with root `packageManager`.
- Build from repository root so workspace contracts resolve.
- Install with the lockfile frozen.
- Copy only required workspace manifests before dependency installation for
  cache efficiency.
- Produce a pruned production runtime with backend and contracts only.
- Run as a non-root user.
- Set production environment and use the compiled Nest entry point.
- Include a container healthcheck against readiness or expose one through
  Compose.
- Do not bake `.env`, database credentials, JWT secrets, source documents, or
  build caches into the image.

### Compose

- Keep PostgreSQL 17 with named volume and healthcheck.
- Add `backend`, depending on PostgreSQL health.
- Pass configuration through environment variables.
- Expose the backend on a separate local port, preferably 3001.
- Add an explicit one-off migration command/service; do not run migrations in
  every backend replica at startup.
- The frontend may continue running on the host during this milestone.
- Do not use `latest` image tags for owned runtime images in deployment examples.

## Testing requirements

### Shared contracts

- Accept valid request/response/JSONB fixtures.
- Reject unknown keys, invalid UUIDs, non-finite coordinates, excessive map size,
  invalid discriminated unions, and oversized values.

### Backend unit tests

Use Nest TestingModule and repository mocks to cover:

- email normalization and duplicate mapping
- password verification success/failure
- JWT payload and authentication-version checks
- project ownership service behavior
- public response mapping excludes password hash
- autosave valid adoption vs invalid last-valid preservation
- revision conflict mapping
- error filtering/redaction

### PostgreSQL integration tests

Run against an isolated PostgreSQL database, never a developer/shared database:

- migrations result in exactly `users` and `projects`
- constraints and cascade delete work
- normalized email uniqueness is race-safe
- all repository operations scope by owner
- conditional autosave increments once and rejects stale revisions
- invalid autosave preserves last-valid columns
- JSONB documents round-trip through Zod validation

### NestJS HTTP E2E tests

Use Supertest against the real Nest pipeline:

- register/login/me/logout cookie flow
- invalid input and unknown-key rejection
- rate limiting on auth routes
- 401 on protected routes
- complete project CRUD
- cross-user read/update/autosave/delete all return the same 404 as missing
- revision conflict returns 409 without project source
- request IDs and stable error shapes
- liveness/readiness behavior

### Frontend component and browser tests

- auth forms and safe error rendering
- project list ownership-facing behavior
- workspace hydration from API data
- autosave debounce, one-in-flight coalescing, retry, and conflict UI
- invalid source saves without replacing last-valid diagram
- default/edited toggle semantics and keyboard access
- default layout is not draggable
- first entry to Edited layout clones default positions
- drag end changes/saves only custom positions
- topology add/delete merge rules for both maps
- reload restores both maps and preferred view
- unauthorized expiry preserves local dirty state before redirect

## Quality gates

Root scripts must make the following possible with pnpm filters or recursive
workspace commands:

- format/check if formatting is configured
- lint all packages
- typecheck all packages
- shared contract tests
- backend unit tests
- backend PostgreSQL integration tests
- backend HTTP E2E tests
- frontend unit/component tests
- frontend browser E2E tests
- frontend production build
- backend production build
- Drizzle migration consistency check
- backend Docker image build

Run gates under Node 24, not an unsupported runtime.

## Implementation sequence for an LLM

Follow this order. Do not generate the whole system as an unverified batch.

1. Record the initial worktree state and current passing/failing gates.
2. Create workspace manifests and move the existing Next.js application into
   `frontend/`; fix imports/config and prove existing frontend behavior still
   builds and tests.
3. Create `packages/contracts` with Zod schemas and contract tests.
4. Scaffold NestJS core, typed config, database lifecycle, error filter,
   request-ID logging, health endpoints, and backend build/test harness.
5. Implement the two-table Drizzle schema and reviewed forward migration.
6. Implement Users repository/service, Auth feature, Passport strategies,
   cookie handling, rate limiting, and auth E2E tests.
7. Implement Projects repository/service/controller with ownership predicates and
   CRUD tests.
8. Implement conditional autosave and concurrency tests.
9. Add backend Dockerfile, Compose backend/migration behavior, healthcheck, and
   image verification.
10. Add frontend typed API clients, auth routes, and project list/detail routes.
11. Hydrate the existing workspace from a project and implement the autosave
    state machine.
12. Implement default/edited position maps and the frontend toggle/drag behavior.
13. Run all quality gates and perform a security/log-redaction review.

Each phase must leave the repository testable. Preserve unrelated changes and
do not use destructive Git commands.

## Definition of done

The implementation is not complete merely because endpoints compile. It is done
only when:

- Target repository layout and single-lockfile workspace are in place.
- NestJS is the only backend HTTP framework.
- Zod, Drizzle, PostgreSQL/`pg`, and Passport are wired through actual runtime
  boundaries rather than listed but bypassed.
- The database contains only users and projects.
- Authentication, ownership, projects, and autosave work end to end.
- Concurrency cannot silently overwrite a newer revision.
- Invalid source cannot overwrite last-valid canonical state.
- Default and edited layouts remain separate through add, delete, drag, toggle,
  autosave, conflict, and reload.
- Backend image starts as non-root, becomes ready after PostgreSQL, and shuts down
  cleanly.
- Logs and errors have been inspected for secrets and schema payloads.
- All documented tests and quality gates pass on Node 24.

## Deliberately deferred

Do not add the following while implementing this specification:

- refresh tokens, session storage, password reset, email verification, OAuth,
  MFA, or account deletion
- teams, roles, sharing, invitations, or public projects
- snapshots/history tables
- Redis, caching, queues, cron jobs, event buses, WebSockets, or microservice
  transports
- backend PostgreSQL DDL parsing or user SQL execution
- a third ORM or validator
- frontend containerization unless separately requested
- export feature expansion
- layout computation in NestJS
- speculative generic abstractions that have only one implementation and no
  testing benefit
