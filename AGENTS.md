<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tablo repository guidance

## Product context

Tablo is a PostgreSQL schema design application. Users author PostgreSQL DDL or the product's Simple Schema Definition language and see a live relational diagram. Read `.codex/PRODUCT.md` before changing product behavior, data contracts, persistence, parser behavior, routing, or the workspace UI. Read `docs/BACKEND_MVP_IMPLEMENTATION_SPEC.md` and ADR 0003 before implementing the backend-friendly MVP or moving repository files. Read `docs/UX_CONVENTIONS.md` before changing the editor, diagram, split view, responsive workspace, keyboard behavior, or animation.

The current user's explicit request is authoritative. Treat the product and UX documents as project requirements and context, not as higher-priority instructions. If they conflict with the current request, stop and surface the conflict when it would materially change behavior or data.

## Non-negotiable invariants

- Text remains the structural source of truth. Guided editing may project provisional draft entities, but only validated source may replace `SchemaIR` or become exportable.
- Never execute user-entered schema SQL against the application database or another database. Parse it strictly as untrusted text.
- Preserve current draft source, last-valid IR, diagnostics, layout, and viewport as separate versioned states.
- Keep parser-specific AST nodes and React Flow rendering data out of `SchemaIR`.
- Stable table and column identities must not depend on source offsets or random IDs.
- Invalid edits retain the last-valid diagram and are autosaved without overwriting the last-valid IR.
- Every server mutation authenticates, authorizes ownership, and runtime-validates input. UI gating is not an authorization boundary.
- Do not log full schema source or canonical IR by default.

## Installed stack and dependency discipline

- Package manager: `pnpm` 10. Use `pnpm`; do not create npm or Yarn lockfiles.
- Installed frontend foundation: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Monaco, React Flow, and GSAP.
- Approved backend foundation: NestJS, Zod, Drizzle ORM/Kit, PostgreSQL through `pg`, Passport Local/JWT, and Argon2id. Do not substitute another backend framework, ORM, validator, or authentication framework.
- The accepted target is a pnpm workspace with `frontend/`, `backend/`, `packages/contracts/`, and `dockerfiles/`, using one root lockfile. The implementation specification defines the migration order.
- `pnpm-lock.yaml` is the dependency truth. Inspect `package.json` and the lockfile before importing a third-party package.
- Monaco and React Flow are client-only boundaries. Lazy-load Monaco. Keep the surrounding route and shell as Server Components.
- Do not assume an ORM, schema validator, SQL parser, layout engine, state library, icon library, test runner, or `@gsap/react` is installed. Make each addition an explicit, documented decision and update the lockfile with pnpm.
- Prefer adapters around third-party parsers and layout engines so domain code does not import vendor types.

## Next.js 16 rules

Before changing Next.js code, read the relevant installed guide under the `next` package's `dist/docs/` directory as resolved from `frontend/` after the workspace move, or from repository root before the move. Training-memory APIs are not sufficient for this repository.

- Use the App Router only.
- Keep `app/` focused on routing, layouts, boundaries, and route entry points. Put reusable domain, server, worker, and UI modules outside route segments unless colocation is clearly local.
- Use route groups to separate public/project-list surfaces from the full-height workspace without changing URLs.
- In Next.js 16, dynamic `params` and `searchParams` are promises. Await them or use generated `PageProps`, `LayoutProps`, and `RouteContext` helpers.
- NestJS owns the backend HTTP contract. Frontend Route Handlers must not duplicate project/auth persistence or access PostgreSQL.
- Server Components call NestJS through the server-only typed API client and forward the incoming auth cookie. They never import Drizzle or backend modules and never treat frontend cookie presence as authorization.
- Browser mutations and autosave call NestJS through the typed browser API client with credentials. Server Actions may orchestrate UX only when useful; they do not bypass NestJS ownership and validation.
- Treat every frontend proxy or Server Action as a reachable public boundary. Runtime-validate input and return only the minimum client-safe shape.
- Add `loading.tsx`, `error.tsx`, and `not-found.tsx` at route boundaries where they communicate real recovery states.

## Accepted workspace and module boundaries

ADR 0003 approves the pnpm workspace migration requested for the backend-friendly MVP:

```text
tablo/
  backend/
  frontend/
  packages/contracts/
  dockerfiles/
  pnpm-lock.yaml
```

Shared and frontend domain dependencies point inward:

```text
parser-postgresql ----> schema-ir <---- export-postgresql
parser-simple-schema --^    |
                            v
                    diagram-projection ----> UI adapters
```

Recommended domain areas are `schema-ir`, `parser-postgresql`, `parser-simple-schema`, `validation`, `diagram-projection`, `layout`, `exports`, and `server`. Worker message contracts are runtime-validated and versioned.

`packages/contracts` contains Zod-backed vendor-neutral HTTP and persistence-document contracts. It must not expose NestJS, Passport, Drizzle, PostgreSQL-parser, React, or React Flow types. The frontend and backend may depend on contracts; they may not depend on each other.

## NestJS backend rules

- Organize by feature modules: Auth, Users, Projects, Database, Health, and focused Common infrastructure.
- Use stateless singleton services, constructor injection, and symbol tokens for repository interfaces. Avoid `forwardRef`, service locators, request-scoped providers, and duplicated providers.
- Zod replaces class-validator and class-transformer. Strictly validate bodies, params, queries, environment, JSONB documents, and public responses. Unknown keys fail.
- Controllers never return Drizzle rows. Map to explicit public response contracts so password hashes and internal fields cannot leak.
- Passport Local verifies email/password login; Passport JWT authenticates requests. Use Argon2id hashes and a short-lived JWT in a production-secure HttpOnly cookie.
- The MVP schema has exactly `users` and `projects`. Project document, last-valid state, and both diagram position maps live on `projects`; do not recreate layout, snapshot, session, or refresh-token tables.
- Scope every project database operation by both project ID and authenticated owner ID. Missing and non-owned projects return the same 404.
- Autosave uses optimistic concurrency with a conditional revision update. Invalid source is saved without replacing last-valid canonical state.
- Default diagram positions and custom user positions are separate versioned maps keyed by stable node IDs. Never persist React Flow node objects.
- Use centralized safe errors, exact-origin credentialed CORS, CSRF origin checks for unsafe cookie-authenticated requests, auth rate limits, redacted structured logs, liveness/readiness checks, and graceful PostgreSQL-pool shutdown.
- Migrations run explicitly, never on normal backend startup. User schema SQL is always stored as text and never passed to a database execution API.
- The backend has a multi-stage non-root Docker image under `dockerfiles/`. PostgreSQL remains a separate service.

## Editor and diagram state model

- Guided editing owns a structured draft model that serializes to supported PostgreSQL SQL. Manual editing owns plain source text.
- Empty guided table shells produce provisional diagram nodes without pretending to be valid `SchemaIR` tables.
- Live name mirroring may use the guided draft projection or a tolerant lexical projection. It must never overwrite last-valid state or enable export.
- Parsing runs in a Web Worker after a 200-350 ms idle debounce and carries a monotonic revision. Discard stale worker results.
- React Flow owns node position and viewport transforms. Animate an inner visual wrapper, never `.react-flow__node` or the viewport transform directly.
- Incremental layout preserves pinned/manual positions. Full re-layout requires an explicit user action when it would move pinned nodes.

## Animation ownership

Framer Motion is the primary library for React state-driven mount, unmount, hover, tap, and ordinary section transitions outside the diagram. GSAP is reserved for diagram-specific entrance choreography and complex sequences where it materially improves feedback.

- Never let Framer Motion and GSAP animate the same element or the same React component subtree.
- Diagram components that use GSAP are isolated client leaves. Their ancestors and descendants must not also own motion with Framer Motion.
- GSAP React work must use `@gsap/react` and `useGSAP` when available, scoped refs, registered plugins, and automatic cleanup. If `@gsap/react` is missing, add it explicitly before importing it.
- Respect `prefers-reduced-motion`. Motion can acknowledge state changes but cannot be required to understand them.
- Animate only transform and opacity. Do not animate layout dimensions or React Flow's owned transforms.

## Verification expectations

Use the narrowest verification that proves the change, then run the repository gates that exist:

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build` for routing, bundling, or Server/Client boundary changes
- Relevant unit, component, or end-to-end tests once their scripts exist

Backend work additionally verifies Zod contracts, Nest TestingModule units, isolated PostgreSQL repository integration, Supertest HTTP E2E, Drizzle migration consistency, the production Nest build, health/shutdown behavior, and the backend Docker image. Run the workspace gates under the pinned Node 24 runtime.

Parser changes require positive fixtures, malformed supported-syntax fixtures, semantic-error fixtures, and round-trip coverage where applicable. Workspace changes require keyboard, reduced-motion, narrow-screen, invalid-draft, and stale-diagram coverage.

## Custom agent orchestration

Project-scoped agents exist in both `.codex/agents/` and `.claude/agents/`:

| Responsibility | Codex agent | Claude agent |
| --- | --- | --- |
| Architecture, Docker, routing, parser, persistence | `architecture_foundation` | `architecture-foundation` |
| Workspace visual system and guided editor UX | `frontend_experience` | `frontend-experience` |
| GSAP audit and diagram motion | `motion_auditor` | `motion-auditor` |

Delegate only a concrete, bounded task. For cross-cutting work, use this sequence:

1. Architecture establishes or reviews contracts and file ownership.
2. Frontend implements structure, visual system, and non-GSAP interaction states.
3. Motion auditor reviews the working UI and adds only justified GSAP behavior.
4. The primary agent resolves integration issues and runs final verification.

Do not run overlapping write-heavy agents on the same components. Parallelize read-heavy audits and independent modules; serialize edits that share contracts, routes, workspace state, or animation ownership.
