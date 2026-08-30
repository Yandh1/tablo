# PostgreSQL parser spike — 2026-08-29

This spike compares parser vendors against Tablo's vendor-neutral PostgreSQL
fixture corpus. It does not define a production adapter and never executes the
fixture SQL.

## Environment and method

- Node.js 24.15.0 on Windows x64.
- Next.js 16.3.3 production build using the default Turbopack bundler.
- Dedicated module workers constructed with `new Worker(new URL(...,
  import.meta.url))`.
- Package versions: `@supabase/pg-parser` 0.1.7 (PostgreSQL 17),
  `libpg-query` 17.7.4, and `pgsql-ast-parser` 12.0.2.
- Candidates not already present in Tablo were installed only in an isolated
  temporary pnpm project. Tablo's `package.json` and `pnpm-lock.yaml` were not
  changed.

The production worker probe sent valid DDL, malformed DDL, and quoted Unicode
identifiers through each worker in a real browser. The Node harness parsed all
eight corpus sources, measured initialization and repeated parse time, and
inspected AST locations and error positions.

## Results

| Gate | `@supabase/pg-parser` | `libpg-query` | `pgsql-ast-parser` |
| --- | --- | --- | --- |
| Expected corpus behavior | 8/8 | 8/8 | 7/8 |
| Valid PostgreSQL DDL | All six parseable fixtures accepted | All six accepted | Five accepted; mixed `GRANT` fixture rejected |
| Malformed fixtures | Both rejected at byte positions 82 and 193 | Both rejected at cursor positions 82 and 193 | Both rejected with line/column text, no structured offset |
| Next 16 production build | Pass | Pass | Pass |
| Production dedicated worker | Pass | **Fail** at WASM instantiation | Pass |
| Quoted/Unicode identifiers | PostgreSQL-normalized AST plus quote-preserving scanner tokens | PostgreSQL-normalized AST | Normalized AST; quote form recoverable from exact location slice |
| Location quality | AST start-byte locations plus exact scanner byte ranges | AST start-byte locations only | Exact UTF-16 start/end ranges on most nodes |
| Scanner/recovery aid | Yes; scanning still succeeded for both malformed fixtures | No scanner in the PG17 package | No tolerant statement recovery |

`semantic-errors.sql` is intentionally syntactically valid. Both PostgreSQL
parsers and `pgsql-ast-parser` accepted it; Tablo's later semantic validator is
responsible for rejecting its graph.

### Worker evidence

`@supabase/pg-parser` completed all three browser probes. Cold worker
initialization plus the first parse was about 81 ms on this machine; its WASM
heap was 17,956,864 bytes before and after the corpus/repeated-parse run.

`libpg-query` compiled under Turbopack but every browser-worker probe failed:

```text
WebAssembly.instantiate(): expected magic word 00 61 73 6d,
found 4e 6f 74 20 @+0
```

The emitted loader requested a location that returned non-WASM content. This
matches the project's documented `.wasm` loading caveat and an open upstream
WASM-loading issue. A custom asset-copy/loader workaround was not accepted as
compatibility for this spike because the shortlist must work under the normal
Next.js 16 production path.

`pgsql-ast-parser` completed all three browser probes. Its first valid parse
took about 6.9 ms and subsequent small probes about 1.1 ms.

### Source ranges and identifiers

The PostgreSQL AST records node starts as UTF-8 byte offsets, not JavaScript
UTF-16 indices. For a source containing `é` and `名`, `@supabase/pg-parser`
returned byte-correct tokens including the original quotes. Its AST normalized
unquoted `Foo`/`Bar` to `foo`/`bar`, preserved quoted `"MiXeD"` and `"名"`, and
the scanner preserved the exact spelling needed to distinguish quoted from
unquoted input.

The scanner returned exact `[start,end)` byte ranges for every token in every
fixture, including malformed sources. Native AST nodes provide reliable starts
for tables, columns, constraints, types, and default expressions, but generally
not complete end positions. The adapter must therefore build a tested UTF-8
byte-to-UTF-16 mapping and combine AST starts with scanner tokens to create
SchemaIR spans. It must not use offsets as identities.

`pgsql-ast-parser` has the best direct node ranges: exact start/end offsets in
JavaScript string coordinates for table, identifier, column, type, constraint,
and expression nodes. That advantage does not outweigh its failure to accept a
valid PostgreSQL statement in the mixed unsupported fixture or its explicitly
partial PostgreSQL grammar.

### Malformed input and recovery

All three parsers fail the whole supplied document on malformed supported DDL;
none returns a partial canonical AST. This is acceptable because invalid input
must retain last-valid SchemaIR. `@supabase/pg-parser` has the strongest adapter
seam: its scanner still returns exact tokens for both malformed fixtures, so a
future adapter can locate statement boundaries, preserve earlier valid
separable statements for diagnostics, and classify unsupported statement
kinds. Such partial information must remain diagnostic/draft state and must
never replace canonical SchemaIR.

### Runtime and bundle implications

Node measurements are comparative development measurements, not product SLOs:

| Candidate | Cold initialization/first parse | Mean of 100 warm small parses | Published/raw payload |
| --- | ---: | ---: | ---: |
| `@supabase/pg-parser` | 12.1 ms initialization | 0.071 ms | PG17 WASM 1,781,351 B; package documents ~254 KB Brotli plus ~16 KB Brotli loader |
| `libpg-query` | 0.054 ms after module import initialization | 0.016 ms | PG17 WASM 1,150,984 B, but unusable in the production worker probe |
| `pgsql-ast-parser` | 2.15 ms first corpus parse | 0.179 ms | 371,991 B package JS entry; production parser chunk observed at roughly 251 KB raw |

Turbopack emitted all three `@supabase/pg-parser` version WASM assets because
the package supports runtime version selection, although the browser requested
only the constructed PG17 runtime. The production adapter should instantiate
one parser lazily inside the parse worker, pin version 17, reuse it, and avoid
loading parser code in the main client or server bundle. A follow-up bundle
budget test should ensure only the requested runtime is transferred.

### Maintenance and licensing

- `@supabase/pg-parser` is MIT, has zero runtime dependencies, and was updated
  on npm in June 2026. It is still a young `0.1.x` API and currently supports
  PostgreSQL 15–17. Source: <https://github.com/supabase-community/pg-parser>.
- `libpg-query` is MIT and was updated in August 2026. It has broader versioned
  packages but an open browser WASM loading risk relevant to this exact use.
  Source: <https://github.com/constructive-io/libpg-query-node>.
- `pgsql-ast-parser` is MIT and was updated in January 2026. Its own README
  states that it covers common syntax rather than the complete PostgreSQL
  grammar. Source: <https://github.com/oguimbal/pgsql-ast-parser>.

The selected WASM embeds `libpg_query`/PostgreSQL-derived code. Binary
distribution must reproduce the applicable copyright, conditions, and
disclaimer in product documentation or other distributed materials. See
<https://github.com/pganalyze/libpg_query/blob/17-latest/LICENSE> in addition
to the package's MIT notice. Legal notice verification remains a release gate.

## Decision

Select `@supabase/pg-parser` 0.1.7 behind a narrow PostgreSQL adapter and pin
the parser runtime to PostgreSQL 17. It is the only candidate that passed the
entire corpus and the actual Next.js 16 production dedicated-worker gate while
also exposing the scanner needed for trustworthy source mapping.

Do not import its AST types outside `domain/parser-postgresql`. Do not parse on
the server per keystroke. Do not treat a partial/recovered statement as
canonical. The production adapter remains a separate implementation phase.

## Remaining risks and required adapter tests

- Map UTF-8 byte offsets to Monaco/SchemaIR UTF-16 positions, including
  surrogate pairs, combining marks, CRLF, and quoted identifiers.
- Derive end spans for constraints and defaults from scanner tokens without
  guessing across statements.
- Add check-constraint expression-preservation fixtures.
- Add statement classification and scanner-based malformed recovery tests.
- Confirm only PG17 WASM is transferred and enforce a compressed worker budget.
- Track PostgreSQL 18 support and the package's pre-1.0 API stability.
- Include and audit third-party notices before distribution.
