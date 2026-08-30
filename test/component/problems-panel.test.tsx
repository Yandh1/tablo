import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProblemsPanel } from "@/components/workspace/problems-panel";

describe("ProblemsPanel", () => {
  it("presents parser diagnostics with severity and source location", () => {
    render(<ProblemsPanel status="invalid" diagnostics={[{
      code: "PGSD1001",
      severity: "error",
      message: "Unexpected comma.",
      range: { start: { offset: 20, line: 2, column: 8 }, end: { offset: 21, line: 2, column: 9 } },
      relatedLocations: [],
      fix: null,
    }]} />);

    expect(screen.getByRole("region", { name: "Problems" })).toHaveTextContent("1 errors, 0 warnings");
    expect(screen.getByText("PGSD1001")).toBeVisible();
    expect(screen.getByText("Ln 2, Col 8")).toBeVisible();
  });
});
