# PostgreSQL parser fixture corpus

This directory is the review contract for Tablo's supported PostgreSQL DDL subset. It deliberately contains no parser implementation and no parser-vendor AST data.

Each fixture has two adjacent files:

- `*.sql` is the exact untrusted source supplied to a future Web Worker parser adapter.
- `*.expected.json` is a versioned, vendor-neutral expectation describing normalized logical structures or diagnostics.

`manifest.ts` maps requirements to fixtures. `fixture-contract.ts` documents the expectation shape. The unit contract test reads the SQL and JSON directly; it never imports or invokes `@supabase/pg-parser`.

## Outcomes

| Outcome | Meaning | Canonical replacement allowed |
| --- | --- | --- |
| `parse-success` | Supported syntax and semantics produce the expected normalized structure. | Yes, after SchemaIR runtime validation. |
| `parse-success-with-warnings` | Supported structures are usable, but valid PostgreSQL statements outside the MVP subset are diagnosed and preserved only in source. | Yes for the supported projection; unsupported statements are never silently exported as modeled objects. |
| `syntax-error` | A statement in the supported subset is malformed. | No; retain last-valid IR. |
| `semantic-error` | PostgreSQL syntax is parseable, but the normalized graph violates Tablo's semantic rules. | No; retain last-valid IR. |

## Supported subset represented here

- `CREATE TABLE`, comments, and multiple statements.
- Quoted identifiers (case preserved) and unquoted identifiers (lower-case normalized).
- Common built-in types, type modifiers, arrays, and preserved default-expression text.
- Inline and table-level primary keys, unique constraints, and foreign keys.
- Composite keys, self-references, parallel relationships, and all SchemaIR v1 referential actions.
- `ALTER TABLE ... ADD CONSTRAINT` for primary, unique, and foreign-key constraints.

Valid PostgreSQL statements outside this subset—represented here by `CREATE INDEX`, `CREATE VIEW`, and `GRANT`—produce `PGSD1101` warnings. They remain in user source but do not enter SchemaIR v1. Malformed supported statements produce `PGSD1001`. Later graph validation owns semantic diagnostics such as unknown tables (`PGSD1201`) and foreign-key arity mismatch (`PGSD1203`).

## Normalization and identity rules

Expected structures record display and normalized identifier names, source column order, type display/normalized forms, modifiers, array rank, defaults, ordered constraint columns, ordered FK mappings, and referential actions. Source spans use exact text anchors, a one-based occurrence, and a one-based start line so reviewers can locate the intended range without coupling expectations to a parser's offset model.

Canonical IDs are intentionally absent. The future adapter must derive them with `domain/schema-ir/ids.ts` after normalization; source offsets and parser node IDs are never identity inputs. Full byte offsets, end positions, and parser-specific recovery metadata are deferred until an adapter proves its source-range behavior against these anchors.

Check constraints are part of SchemaIR v1 but are outside this requested corpus slice; their expression-preservation fixtures belong with the parser adapter slice that defines safe canonical expression handling.
