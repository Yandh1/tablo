import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { projects } from "../../server/db/schema";

describe("project persistence schema", () => {
  it("keeps draft source and last-valid schema state in separate columns", () => {
    const columns = getTableColumns(projects);

    expect(getTableName(projects)).toBe("projects");
    expect(columns.sourceText.name).toBe("source_text");
    expect(columns.lastValidIr.name).toBe("last_valid_ir");
    expect(columns.sourceText).not.toBe(columns.lastValidIr);
  });
});
