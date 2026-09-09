# Tablo product specification

## Status and precedence

This document defines the backend-friendly MVP approved on 2026-09-08. The
current user's explicit request remains authoritative. `docs/UX_CONVENTIONS.md`
adds detailed workspace behavior, while
`docs/BACKEND_MVP_IMPLEMENTATION_SPEC.md` defines the implementation contract.

## Product

Tablo is a PostgreSQL schema design application for backend and full-stack
developers. A user creates a project, authors PostgreSQL DDL in Guided or Manual
mode, and sees a live relational diagram. The MVP adds accounts, owned projects,
durable autosave, and two diagram layouts without turning Tablo into a database
administration or migration-execution tool.

User-authored SQL is always untrusted text. Tablo parses and visualizes it but
never executes it against the application database or any external database.

## Backend-friendly MVP scope

The milestone is complete when an authenticated user can:

1. Register, sign in, inspect the current account, and sign out.
2. Create, list, open, rename, autosave, and delete owned projects.
3. Never read or mutate another user's project, including by guessing an ID.
4. Reload a project without losing its current source, incomplete Guided draft,
   last-valid canonical schema, authoring mode, or diagram layouts.
5. Work in either `Default layout` or `Edited layout` and switch between them.
6. Keep automatically generated positions separate from user-repositioned
   positions.
7. See explicit save states: Clean, Dirty, Saving, Saved, Failed, and Conflict.

The backend is a standalone NestJS HTTP application using Zod, Drizzle ORM,
PostgreSQL through the `pg` driver, and Passport. It has its own Docker image.
The Next.js frontend and NestJS backend live in one pnpm workspace with one root
lockfile.

## Product invariants

- Text remains the structural source of truth.
- Guided editing may persist an incomplete structured draft, but only validated
  source may replace last-valid SchemaIR or become exportable.
- Invalid source is autosaved without overwriting last-valid SchemaIR.
- Parser AST values, Drizzle row types, Passport request objects, and React Flow
  nodes never become shared product contracts.
- Stable table and column identities never depend on source offsets, array
  indexes, or random render-time IDs.
- Default and edited diagram positions are versioned, validated maps keyed by
  stable diagram node identity. They do not store React Flow node objects.
- Default layout updates never overwrite edited positions.
- Every non-public backend route authenticates the caller.
- Every project query and mutation scopes by both project ID and authenticated
  owner ID at the database boundary.
- Every request body, route parameter, query, environment variable, JSONB value,
  and public response is runtime-validated with Zod.
- Controllers never return database rows directly.
- Full schema source, password material, tokens, cookies, canonical IR, and
  layout payloads are not logged.
- Database migrations are reviewed and run explicitly; application startup does
  not mutate the database schema.

## Accounts and authentication

The MVP supports email-and-password authentication only.

- Email comparison is case-insensitive and uses a separately stored normalized
  email for uniqueness.
- Passwords are hashed with Argon2id. Plaintext passwords are never stored,
  returned, or logged.
- Passport Local authenticates login credentials.
- Passport JWT authenticates protected requests.
- The JWT contains only user ID, authentication version, issuer, audience,
  issued-at time, and expiry.
- The JWT is delivered in a Secure, HttpOnly, SameSite cookie in production.
- The preferred production topology exposes the frontend and NestJS API through
  one public origin, routing `/api` to the backend. Local development uses an
  exact-origin credentialed CORS allowlist.
- The backend re-loads the user and checks authentication version for each
  authenticated request.
- Login and registration are rate-limited.

The two-table constraint deliberately excludes sessions and refresh-token
records. The MVP therefore uses a short-lived access token and requires sign-in
again after expiry. Logout clears the browser cookie but cannot revoke a stolen
token before expiry. Durable refresh-token rotation, password recovery, email
verification, OAuth, multi-factor authentication, and per-device sessions are
future work and require a revised persistence decision.

## Project ownership

A user owns zero or more projects. A project has exactly one owner.

- The owner ID is always derived from the authenticated Passport principal.
- Clients cannot choose or change `ownerId`.
- Lists return only the caller's projects.
- Read, rename, autosave, and delete operations use a query predicate containing
  both `projects.id` and `projects.owner_id`.
- A missing and a non-owned project both return the same `404 PROJECT_NOT_FOUND`
  response to avoid resource enumeration.
- Frontend visibility is not an authorization boundary.

## Autosave and concurrency

Each project has one monotonically increasing revision covering project document
state and both layouts. Autosave uses optimistic concurrency:

1. The frontend sends `baseRevision`, the latest source/draft state, last-valid
   adoption state, and layout changes.
2. The backend performs one atomic update constrained by project ID, owner ID,
   and `revision = baseRevision`.
3. A successful update increments the revision and returns the persisted
   project document.
4. If no row is updated, the backend distinguishes not-found from a revision
   conflict without revealing another owner's project.
5. A conflict returns `409 PROJECT_REVISION_CONFLICT` and the current revision,
   not another copy of potentially sensitive project source.

When adopting a valid canonical document, the backend computes the source hash
itself and requires the submitted SchemaIR source hash to match. It never trusts
a client-supplied hash without recomputation.

The frontend keeps at most one autosave request in flight. New edits are
coalesced into one pending snapshot and sent after the current request settles.
Network failure never clears dirty state. Conflict never silently overwrites
either version.

## Diagram layouts

Every project stores two independent position documents:

- `defaultDiagramPositions`: generated by the frontend layout algorithm when
  diagram topology changes.
- `customDiagramPositions`: created from the default positions the first time
  the user enters Edited layout, then changed only by user layout actions.

The backend validates and stores these documents but does not import React Flow
or calculate layout.

Frontend behavior:

- The visible toggle is labelled `Default layout` and `Edited layout`.
- Default layout is not draggable. It remains the reproducible automatic view.
- Edited layout is draggable and saves position changes only on drag end, not
  on every pointer movement.
- Entering Edited layout for the first time copies the current default map.
- Adding a table recomputes the default map. Existing custom positions remain
  unchanged; the new node receives its default position in the custom map.
- Deleting a table removes its entry from both maps.
- Reconciliation from a Guided draft ID to canonical table ID remaps both maps
  atomically in frontend state before autosave.
- Resetting Edited layout copies the current default map after explicit user
  confirmation.
- Switching views changes positions only; it never changes source, parse state,
  selection, or canonical identities.

## Persistence boundary

The PostgreSQL schema contains exactly two application tables:

1. `users`
2. `projects`, with a many-to-one foreign key to `users`

Layouts, current draft, last-valid canonical state, and autosave metadata are
columns on `projects`. There are no project-layout, snapshot, session,
refresh-token, role, membership, or audit-log tables in this MVP.

## Frontend surfaces

- `/login`
- `/register`
- `/projects`
- `/projects/[projectId]`

The workspace remains desktop-first and preserves the editor/diagram UX contract.
The frontend uses a typed API client and includes credentials for browser calls.
Server-rendered calls forward the authentication cookie to NestJS but do not
verify or decode authentication as an authorization decision.

## Explicit non-goals

- Executing user-authored SQL
- Connecting to or introspecting external databases
- Teams, sharing, roles, or organization membership
- Snapshots or project history
- Refresh-token sessions
- Password reset or email verification
- OAuth or social login
- Real-time collaboration
- Background jobs, queues, Redis, or event buses
- A separate layout service
- Backend parsing on every keystroke
- Export work beyond preserving the existing canonical-state boundary
- A frontend Docker image as a requirement of this milestone

## MVP acceptance criteria

- The repository uses `backend/`, `frontend/`, `packages/contracts/`, and
  `dockerfiles/` with one root `pnpm-lock.yaml`.
- The backend starts independently and in Docker, fails fast on invalid config,
  exposes liveness/readiness endpoints, and shuts down its PostgreSQL pool.
- Only `users` and `projects` exist after migrations.
- Password hashes and tokens never appear in API responses or logs.
- Unknown request fields are rejected.
- Unauthorized calls return 401; non-owned project IDs behave like missing IDs.
- Autosave rejects stale revisions and preserves dirty state on the frontend.
- Invalid source persists without replacing last-valid IR.
- Default and edited layout maps survive reload and never overwrite each other.
- Layout drag changes are sent only from Edited layout and only after drag end.
- Unit, PostgreSQL integration, NestJS HTTP E2E, frontend component, and browser
  E2E tests cover the critical paths.
- Lint, typecheck, tests, production builds, migration checks, and backend image
  build all pass under the pinned Node and pnpm versions.
