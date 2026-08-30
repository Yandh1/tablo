# ADR 0002: PostgreSQL DDL parser

- Status: Accepted
- Date: 2026-08-29

## Context

Tablo must parse untrusted PostgreSQL DDL continuously in a browser Web Worker,
preserve reviewable source diagnostics, and produce parser-independent
SchemaIR. The parser must never execute SQL. Training-memory and README claims
are insufficient because Next.js 16 uses Turbopack by default and WASM loading
behavior differs between bundlers.

The spike evaluated `@supabase/pg-parser` 0.1.7, `libpg-query` 17.7.4, and
`pgsql-ast-parser` 12.0.2 against every vendor-neutral fixture and in separate
production-built dedicated workers. Full evidence is recorded in
`docs/spikes/postgresql-parser-2026-08-29.md`.

## Options considered

1. `@supabase/pg-parser`: real PostgreSQL parser compiled to WASM, with a
   quote-preserving scanner and PostgreSQL 15–17 runtime selection.
2. `libpg-query`: a narrower PostgreSQL WASM parser package with no scanner in
   its PostgreSQL 17 build.
3. `pgsql-ast-parser`: a pure TypeScript parser with excellent node ranges but
   an intentionally incomplete PostgreSQL grammar.

## Decision

Use `@supabase/pg-parser` behind one narrow `domain/parser-postgresql` adapter,
pinning the runtime to PostgreSQL 17. Initialize it lazily inside a dedicated
Web Worker and reuse the instance. Convert vendor AST and UTF-8 byte locations
to runtime-validated, vendor-neutral results before posting worker messages.

No parser AST, vendor enum, React Flow value, layout value, or provisional
guided object may cross the adapter or enter SchemaIR. Invalid parses preserve
last-valid IR. Scanner-assisted partial recovery may improve diagnostics but
may not create exportable canonical state.

## Consequences

- The selected candidate passed 8/8 expected corpus outcomes and parsed valid,
  malformed, quoted, Unicode, and unsupported-statement probes in an actual
  Next.js 16 production worker.
- PostgreSQL grammar fidelity is stronger than a handwritten JavaScript grammar.
- PG17 WASM adds 1,781,351 raw bytes (about 254 KB Brotli per upstream
  measurement) plus its loader and worker code, so loading must remain lazy and
  isolated from the main thread.
- AST locations are UTF-8 byte starts. The adapter must combine them with exact
  scanner ranges and a tested byte-to-UTF-16 mapper to produce source spans.
- The package is MIT but embeds PostgreSQL/libpg_query-derived binary code;
  applicable MIT and PostgreSQL/libpg_query notices must ship with distributions.
- The package is pre-1.0 and currently stops at PostgreSQL 17. Lockfile updates,
  PostgreSQL-version changes, and AST shape changes require rerunning the corpus
  and production worker gate.

## Rejected alternatives

`libpg-query` matched the corpus in Node but failed every actual production
browser-worker probe because its emitted WASM request returned non-WASM
content. A custom loader workaround would add avoidable framework coupling and
was not accepted as compatibility.

`pgsql-ast-parser` ran successfully in the worker and offers direct start/end
ranges, but it rejected the valid mixed unsupported-statement fixture at
`GRANT` and documents incomplete PostgreSQL coverage. It remains a conceptual
fallback only if PostgreSQL-WASM delivery becomes untenable and the supported
DDL subset is deliberately narrowed.

## Reversal path

All vendor access is confined to the parser adapter. A replacement must pass
the same fixture corpus, source-range tests, malformed-input tests, license
review, bundle budget, and Next.js production dedicated-worker test. SchemaIR,
worker message contracts, and UI state must remain unchanged.
