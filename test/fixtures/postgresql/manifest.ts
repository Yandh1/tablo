import type { FixtureFeature, FixtureOutcome } from "./fixture-contract";

export interface PostgresFixtureManifestEntry {
  slug: string;
  source: `${"positive" | "negative"}/${string}.sql`;
  expectation: `${"positive" | "negative"}/${string}.expected.json`;
  outcome: FixtureOutcome;
  features: readonly FixtureFeature[];
}

export const requiredPostgresFixtureFeatures = [
  "create-table",
  "quoted-identifiers",
  "unquoted-identifiers",
  "identifier-normalization",
  "built-in-types",
  "type-modifiers",
  "arrays",
  "defaults",
  "inline-primary-key",
  "table-primary-key",
  "unique-constraints",
  "inline-foreign-key",
  "table-foreign-key",
  "composite-keys",
  "self-references",
  "parallel-foreign-keys",
  "referential-actions",
  "alter-table-add-constraint",
  "comments",
  "multiple-statements",
  "unsupported-statements",
  "malformed-supported-statement",
] as const satisfies readonly FixtureFeature[];

export const postgresFixtureManifest = [
  {
    slug: "create-table-types",
    source: "positive/create-table-types.sql",
    expectation: "positive/create-table-types.expected.json",
    outcome: "parse-success",
    features: ["create-table", "unquoted-identifiers", "identifier-normalization", "built-in-types", "type-modifiers", "arrays", "defaults", "inline-primary-key", "table-primary-key", "unique-constraints", "composite-keys", "comments", "multiple-statements"],
  },
  {
    slug: "quoted-identifiers",
    source: "positive/quoted-identifiers.sql",
    expectation: "positive/quoted-identifiers.expected.json",
    outcome: "parse-success",
    features: ["create-table", "quoted-identifiers", "unquoted-identifiers", "identifier-normalization", "built-in-types", "type-modifiers", "table-primary-key", "composite-keys"],
  },
  {
    slug: "relationships",
    source: "positive/relationships.sql",
    expectation: "positive/relationships.expected.json",
    outcome: "parse-success",
    features: ["create-table", "inline-primary-key", "table-primary-key", "unique-constraints", "inline-foreign-key", "table-foreign-key", "composite-keys", "self-references", "parallel-foreign-keys", "referential-actions", "multiple-statements"],
  },
  {
    slug: "alter-table-constraints",
    source: "positive/alter-table-constraints.sql",
    expectation: "positive/alter-table-constraints.expected.json",
    outcome: "parse-success",
    features: ["create-table", "alter-table-add-constraint", "table-primary-key", "unique-constraints", "table-foreign-key", "composite-keys", "referential-actions", "multiple-statements"],
  },
  {
    slug: "unsupported-statements",
    source: "negative/unsupported-statements.sql",
    expectation: "negative/unsupported-statements.expected.json",
    outcome: "parse-success-with-warnings",
    features: ["create-table", "inline-primary-key", "multiple-statements", "unsupported-statements"],
  },
  {
    slug: "malformed-create-table",
    source: "negative/malformed-create-table.sql",
    expectation: "negative/malformed-create-table.expected.json",
    outcome: "syntax-error",
    features: ["malformed-supported-statement", "create-table"],
  },
  {
    slug: "malformed-alter-table",
    source: "negative/malformed-alter-table.sql",
    expectation: "negative/malformed-alter-table.expected.json",
    outcome: "syntax-error",
    features: ["malformed-supported-statement", "alter-table-add-constraint", "table-foreign-key"],
  },
  {
    slug: "semantic-errors",
    source: "negative/semantic-errors.sql",
    expectation: "negative/semantic-errors.expected.json",
    outcome: "semantic-error",
    features: ["create-table", "table-primary-key", "table-foreign-key", "composite-keys", "later-semantic-error"],
  },
] as const satisfies readonly PostgresFixtureManifestEntry[];
