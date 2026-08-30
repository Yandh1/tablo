export const POSTGRESQL_MVP_PARSER_CAPABILITIES = {
  contractVersion: 1,
  supported: [
    "multiple-create-table-statements",
    "comments-and-semicolons",
    "quoted-and-unquoted-identifiers",
    "common-postgresql-types",
    "primary-key",
    "not-null",
    "unique",
    "inline-single-column-reference",
    "table-single-column-foreign-key",
  ],
  deferred: [
    "alter-table",
    "composite-keys",
    "named-constraints",
    "check-constraints",
    "identity-semantics",
    "multiple-schemas",
    "array-semantics",
    "semantic-type-compatibility",
    "sql-generation",
    "simple-schema-language",
  ],
} as const;

