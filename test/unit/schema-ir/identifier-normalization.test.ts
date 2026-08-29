import { describe, expect, it } from "vitest";

import {
  InvalidPostgresIdentifierError,
  normalizePostgresIdentifier,
} from "@/domain/schema-ir";

describe("PostgreSQL identifier normalization", () => {
  it("folds unquoted identifiers to lower case", () => {
    expect(normalizePostgresIdentifier("AccountEvents")).toEqual({
      displayName: "AccountEvents",
      normalizedName: "accountevents",
      quoted: false,
    });
  });

  it("preserves quoted case and decodes escaped quotes", () => {
    expect(normalizePostgresIdentifier('"Account""Events"')).toEqual({
      displayName: 'Account"Events',
      normalizedName: 'Account"Events',
      quoted: true,
    });
  });

  it("keeps quoted and unquoted identities distinct", () => {
    expect(normalizePostgresIdentifier("Users").normalizedName).not.toBe(
      normalizePostgresIdentifier('"Users"').normalizedName,
    );
  });

  it.each(["", "two words", '"unterminated', '""']) (
    "rejects malformed identifier %j",
    (raw) => {
      expect(() => normalizePostgresIdentifier(raw)).toThrow(
        InvalidPostgresIdentifierError,
      );
    },
  );
});
