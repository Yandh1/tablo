# PostgreSQL parser MVP boundary

This adapter parses untrusted text only. It never executes SQL and has no React,
worker, persistence, route, layout, React Flow, or export dependency.

The public result is `ParsedSchemaV1`, a small diagram input containing tables,
columns, and single-column relationships. It is not `SchemaIR`; successful
results explicitly require SchemaIR conversion and validation before export.

Supported now: multiple `CREATE TABLE` statements, comments and semicolons,
PostgreSQL identifier folding, common built-in displayed types, single-column
primary/unique keys, `NOT NULL`, inline references, and table-level
single-column foreign keys.

Deferred constructs are listed in `domain/parser/capabilities.ts`. Constructs
that can be omitted without changing the table/relationship picture (constraint
names, checks, defaults, identity details, arrays' semantics, and FK actions)
produce precise warnings. Constructs that would make the picture ambiguous or
incomplete (other statements, non-public schemas, composite keys, unknown
types, and unsupported table features) produce errors and no `ParsedSchema`.

