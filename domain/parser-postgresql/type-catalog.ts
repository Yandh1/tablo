export type PostgresTypeCategory =
  | "Recommended"
  | "Numeric"
  | "Text"
  | "Boolean"
  | "Date and time"
  | "JSON"
  | "Identifiers"
  | "Network"
  | "Binary"
  | "System";

export type PostgresTypeModifierKind =
  | "length"
  | "precision-scale"
  | "time-precision"
  | null;

export interface PostgresTypeCatalogOption {
  canonicalName: string;
  aliases: readonly string[];
  category: PostgresTypeCategory;
  description: string;
  modifier: PostgresTypeModifierKind;
}

const option = (
  canonicalName: string,
  category: PostgresTypeCategory,
  description: string,
  aliases: readonly string[] = [],
  modifier: PostgresTypeModifierKind = null,
): PostgresTypeCatalogOption => ({
  aliases,
  canonicalName,
  category,
  description,
  modifier,
});

/**
 * The single UI-facing catalogue for the built-ins adopted by the PostgreSQL
 * parser adapter. The parser derives its alias lookup from this same list.
 */
export const POSTGRES_TYPE_CATALOG = [
  option("uuid", "Recommended", "Universally unique identifier"),
  option("text", "Recommended", "Variable-length text"),
  option("integer", "Recommended", "Signed four-byte integer", ["int", "int4"]),
  option("bigint", "Recommended", "Signed eight-byte integer", ["int8"]),
  option("timestamp with time zone", "Recommended", "Date and time with time-zone normalization", ["timestamptz"], "time-precision"),
  option("jsonb", "Recommended", "Binary JSON with indexing support"),
  option("smallint", "Numeric", "Signed two-byte integer", ["int2"]),
  option("numeric", "Numeric", "Exact decimal number", ["decimal"], "precision-scale"),
  option("real", "Numeric", "Single-precision floating point", ["float4"]),
  option("double precision", "Numeric", "Double-precision floating point", ["float8"]),
  option("money", "Numeric", "Currency amount"),
  option("smallserial", "Numeric", "Auto-incrementing two-byte integer", ["serial2"]),
  option("serial", "Numeric", "Auto-incrementing four-byte integer", ["serial4"]),
  option("bigserial", "Numeric", "Auto-incrementing eight-byte integer", ["serial8"]),
  option("character varying", "Text", "Length-limited variable text", ["varchar"], "length"),
  option("character", "Text", "Fixed-length text", ["char", "bpchar"], "length"),
  option("name", "Text", "PostgreSQL internal identifier name"),
  option("xml", "Text", "XML document"),
  option("boolean", "Boolean", "True or false value", ["bool"]),
  option("date", "Date and time", "Calendar date"),
  option("time", "Date and time", "Time of day without time zone", [], "time-precision"),
  option("time with time zone", "Date and time", "Time of day with time zone", ["timetz"], "time-precision"),
  option("timestamp", "Date and time", "Date and time without time zone", [], "time-precision"),
  option("interval", "Date and time", "Span of time"),
  option("json", "JSON", "Textual JSON document"),
  option("oid", "Identifiers", "PostgreSQL object identifier"),
  option("inet", "Network", "IPv4 or IPv6 host and network"),
  option("cidr", "Network", "IPv4 or IPv6 network"),
  option("macaddr", "Network", "Six-byte MAC address"),
  option("macaddr8", "Network", "Eight-byte MAC address"),
  option("bytea", "Binary", "Binary byte sequence"),
  option("bit", "Binary", "Fixed-length bit string", [], "length"),
  option("bit varying", "Binary", "Variable-length bit string", ["varbit"], "length"),
] as const satisfies readonly PostgresTypeCatalogOption[];

const deduplicatedCatalog = POSTGRES_TYPE_CATALOG.filter(
  (candidate, index, catalog) =>
    catalog.findIndex((item) => item.canonicalName === candidate.canonicalName)
      === index,
);

export const GUIDED_POSTGRES_TYPE_CATALOG: readonly PostgresTypeCatalogOption[] =
  deduplicatedCatalog;

export const POSTGRES_TYPE_CANONICAL_NAME_BY_ALIAS: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      deduplicatedCatalog.flatMap((candidate) => [
        [candidate.canonicalName, candidate.canonicalName],
        ...candidate.aliases.map((alias) => [alias, candidate.canonicalName]),
      ]),
    ),
  );

export function resolveBuiltInPostgresType(typeName: string): string | null {
  return POSTGRES_TYPE_CANONICAL_NAME_BY_ALIAS[typeName.toLowerCase()] ?? null;
}

export interface PostgresTypeSelection {
  option: PostgresTypeCatalogOption;
  length: string;
  precision: string;
  scale: string;
  timePrecision: string;
}

export function parsePostgresTypeSelection(
  dataType: string,
): PostgresTypeSelection | null {
  const normalized = dataType.trim().toLowerCase();
  if (!normalized) return null;

  for (const candidate of deduplicatedCatalog) {
    let match: RegExpMatchArray | null = null;
    for (const spelling of [candidate.canonicalName, ...candidate.aliases]) {
      const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (candidate.modifier === "time-precision" && spelling.endsWith(" with time zone")) {
        const base = spelling.replace(" with time zone", "");
        match = normalized.match(new RegExp(`^${base}(?:\\((\\d+)\\))? with time zone$`));
      } else if (candidate.modifier === "precision-scale") {
        match = normalized.match(new RegExp(`^${escaped}(?:\\((\\d+)(?:\\s*,\\s*(\\d+))?\\))?$`));
      } else if (candidate.modifier === "length" || candidate.modifier === "time-precision") {
        match = normalized.match(new RegExp(`^${escaped}(?:\\((\\d+)\\))?$`));
      } else if (normalized === spelling) {
        match = [normalized] as RegExpMatchArray;
      }
      if (match) break;
    }

    if (!match) continue;
    return {
      option: candidate,
      length: candidate.modifier === "length" ? (match[1] ?? "") : "",
      precision: candidate.modifier === "precision-scale" ? (match[1] ?? "") : "",
      scale: candidate.modifier === "precision-scale" ? (match[2] ?? "") : "",
      timePrecision: candidate.modifier === "time-precision" ? (match[1] ?? "") : "",
    };
  }

  return null;
}

export function formatPostgresTypeSelection(
  selection: PostgresTypeSelection,
): string {
  const { option } = selection;
  if (option.modifier === "length" && selection.length) {
    return `${option.canonicalName}(${selection.length})`;
  }
  if (option.modifier === "precision-scale" && selection.precision) {
    const scale = selection.scale ? `,${selection.scale}` : "";
    return `${option.canonicalName}(${selection.precision}${scale})`;
  }
  if (option.modifier === "time-precision" && selection.timePrecision) {
    if (option.canonicalName.endsWith(" with time zone")) {
      const base = option.canonicalName.replace(" with time zone", "");
      return `${base}(${selection.timePrecision}) with time zone`;
    }
    return `${option.canonicalName}(${selection.timePrecision})`;
  }
  return option.canonicalName;
}
