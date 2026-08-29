import type { Identifier, SourceSpan } from "./types";

const QUOTED_IDENTIFIER = /^"(?:[^"]|"")+"$/u;
const UNQUOTED_IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_$]*$/u;

export class InvalidPostgresIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPostgresIdentifierError";
  }
}

/**
 * Applies PostgreSQL's identifier comparison rules without consulting a parser
 * AST. Unquoted identifiers fold to lower case; quoted identifiers preserve
 * case and decode doubled quote escapes.
 */
export function normalizePostgresIdentifier(raw: string): {
  displayName: string;
  normalizedName: string;
  quoted: boolean;
} {
  if (QUOTED_IDENTIFIER.test(raw)) {
    const displayName = raw.slice(1, -1).replaceAll('""', '"');

    if (displayName.length === 0) {
      throw new InvalidPostgresIdentifierError(
        "A quoted PostgreSQL identifier cannot be empty.",
      );
    }

    return { displayName, normalizedName: displayName, quoted: true };
  }

  if (!UNQUOTED_IDENTIFIER.test(raw)) {
    throw new InvalidPostgresIdentifierError(
      `Invalid PostgreSQL identifier: ${JSON.stringify(raw)}.`,
    );
  }

  return {
    displayName: raw,
    normalizedName: raw.toLowerCase(),
    quoted: false,
  };
}

export function createIdentifier(raw: string, sourceSpan: SourceSpan): Identifier {
  return { ...normalizePostgresIdentifier(raw), sourceSpan };
}
